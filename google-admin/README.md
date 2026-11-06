# Google Workspace groups

`groups.csv` lists the groups to create in Google Admin (admin.google.com → Directory → Groups → Create group) for HN Group's domains: hngroup.org.uk, horizon-network.co.uk, media.hngroup.org.uk and horizonadvertising.co.uk.

- **Staff lists**: only people in the organisation can post. All Staff contains the company groups as members (nested), so add each person only to their company's group.
- **Shared inboxes**: anyone on the web can email them; turn on *Collaborative inbox* (Groups → the group → Settings) so replies can be assigned and marked done.
- **Alerts / Accounts**: addresses used to sign up for outside services (registrar, Cloudflare, Discord developer account, certificate and uptime alerts), so they never depend on one person's mailbox.
- **Workspace Admins** is a security group (tick *Security* label) for assigning Google Admin roles.

Check an address isn't already a user or alias before creating its group (admin@hngroup.org.uk is a staff account, so it isn't used here). Membership is described by role, not by name: add the people who hold those roles.
