# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration connects to the MQTT broker set in its configuration, with the
user name and password typed there (kept by Gladys, never logged, never written
by the integration), and only subscribes to the ESPresense topics: it never
publishes. It keeps in memory the readings of the last minutes (device ids,
distances, rooms) and writes nothing to `/data` but its MQTT client id. No
other network access, no cloud service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the MQTT broker, ESPresense and ESPresense-companion.
