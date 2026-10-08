#!/usr/bin/env python3
"""Guardrail against the 2026-07-25 company-wide outage (platform#1555).

A VPC *interface* endpoint with `private_dns_enabled = true` hijacks the
service's DNS name (e.g. secretsmanager.us-east-1.amazonaws.com) for the
ENTIRE shared VPC — every resource in the VPC is then forced through that
endpoint, with no internet fallback. So the endpoint's security group MUST
admit the whole VPC on 443. The pouchbooks Secrets Manager endpoint scoped its
SG to only the Lambda's SG; that silently cut Secrets Manager off for every
agent Fargate task (which fetches the Claude token at launch), taking the whole
company down.

This check fails any infra that reintroduces that anti-pattern. For every
`aws_vpc_endpoint` with `private_dns_enabled = true`, it verifies each attached
security group admits inbound 443 from the VPC CIDR (a `cidr_blocks` ingress
referencing `data.aws_vpc.default.cidr_block`, an explicit VPC-wide CIDR, or
0.0.0.0/0). A security-group-scoped-only ingress fails.

Exit 0 = pass, 1 = violation. Run from the repo root.
"""
import pathlib
import re
import sys

INFRA = pathlib.Path("infra")
# What counts as "admits the whole VPC" in an ingress cidr_blocks list.
VPC_WIDE_CIDR = re.compile(
    r"data\.aws_vpc\.default\.cidr_block"
    r"|0\.0\.0\.0/0"
    r"|172\.31\.0\.0/16"  # this account's default-VPC CIDR
)


def resource_blocks(src, rtype):
    """Yield (name, body) for every top-level `resource "<rtype>" "<name>" {…}`
    block, brace-balanced so nested blocks don't end it early."""
    for m in re.finditer(rf'resource\s+"{re.escape(rtype)}"\s+"([^"]+)"\s*{{', src):
        name = m.group(1)
        i = m.end()
        depth = 1
        while i < len(src) and depth:
            if src[i] == "{":
                depth += 1
            elif src[i] == "}":
                depth -= 1
            i += 1
        yield name, src[m.end():i - 1]


def sg_admits_vpc_443(body):
    """True if a security_group body has an ingress admitting 443 from a
    VPC-wide cidr_blocks entry."""
    for m in re.finditer(r"ingress\s*{", body):
        i = m.end()
        depth = 1
        while i < len(body) and depth:
            if body[i] == "{":
                depth += 1
            elif body[i] == "}":
                depth -= 1
            i += 1
        ing = body[m.end():i - 1]
        # must cover 443 and use a VPC-wide cidr_blocks entry
        from_ok = re.search(r"from_port\s*=\s*443", ing)
        to_ok = re.search(r"to_port\s*=\s*443", ing)
        cidr_ok = "cidr_blocks" in ing and VPC_WIDE_CIDR.search(ing)
        if from_ok and to_ok and cidr_ok:
            return True
    return False


def main():
    if not INFRA.is_dir():
        print("no infra/ dir; nothing to check")
        return 0
    src = "\n".join(p.read_text() for p in sorted(INFRA.glob("*.tf")))

    # Map security_group name -> body.
    sgs = dict(resource_blocks(src, "aws_security_group"))

    violations = []
    for ep_name, ep_body in resource_blocks(src, "aws_vpc_endpoint"):
        if not re.search(r"private_dns_enabled\s*=\s*true", ep_body):
            continue
        # SG references: security_group_ids = [aws_security_group.NAME.id, …]
        sg_refs = re.findall(r"aws_security_group\.([A-Za-z0-9_]+)\.id", ep_body)
        if not sg_refs:
            violations.append(
                f"aws_vpc_endpoint.{ep_name}: private_dns_enabled=true but no "
                "aws_security_group.<name>.id could be resolved from its "
                "security_group_ids — cannot verify it admits the VPC."
            )
            continue
        for sg in sg_refs:
            body = sgs.get(sg)
            if body is None:
                violations.append(
                    f"aws_vpc_endpoint.{ep_name}: references aws_security_group."
                    f"{sg} which wasn't found in infra/*.tf — cannot verify."
                )
            elif not sg_admits_vpc_443(body):
                violations.append(
                    f"aws_vpc_endpoint.{ep_name} has private_dns_enabled=true "
                    f"(VPC-wide DNS hijack) but its security group "
                    f"aws_security_group.{sg} does NOT admit inbound 443 from "
                    "the VPC CIDR. Scoping it to one service's SG cuts this "
                    "service off for every OTHER resource in the shared VPC — "
                    "the platform#1555 outage. Add an ingress: from_port=443, "
                    "to_port=443, cidr_blocks=[data.aws_vpc.default.cidr_block]."
                )

    if violations:
        print("::error::VPC private-DNS endpoint security-group scope violation "
              "(platform#1555 guardrail):")
        for v in violations:
            print(f"  - {v}")
        return 1
    print("VPC private-DNS endpoint SG scope: OK "
          "(all private-DNS endpoints admit the VPC on 443).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
