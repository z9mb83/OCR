# DLT Templates

Principal Entity: **99 Consulting Services** · Header / Sender ID: **`099559`** · DLT operator: **Tata Tele** · Telemarketer: **GreenAds Global (Telinfy)**

| Name | Template ID | Route | Vars | Used by | In Telinfy |
|---|---|---|---|---|---|
| Outreach (old Shaadi) | `1677100000000393293` | Promotional | 0 | — (replaced) | Yes |
| Shaadi – Outreach | `1677100000000395222` | Promotional | 0 | Shaadi sheet | Yes |
| 99ConsultingServices | `1677100000000394217` | Promotional | 0 | Tests | Yes |
| 99StaffingServices | `1677100000000394219` | Promotional | 0 | Tests | Yes |
| PEG (Property Experts Group) | `1677100000000394325` | Promotional | 0 | Property sheet | Yes |
| SkylineCapital | `1677100000000394326` | Promotional | 0 | — | Check |

## Approved texts (must be sent exactly)

**Shaadi – Outreach** `1677100000000395222`
> Elite Matrimonial Solutions. Confidential Matchmaking with 30+ Years Experience. Sector 18A, Chandigarh. 99 Consulting Services Shaadi-bells.com Call 7770000559, 9417004832, 9815631231.

**Outreach (old)** `1677100000000393293` — 170 chars (2 SMS)
> 99 Consulting Services - Elite Matrimonial Solutions. Confidential Matchmaking with 30+ Years Experience. Sector 18A, Chandigarh. Call 9417004832, 9815631231, 7770000559.

**99ConsultingServices** `1677100000000394217` — 259 chars (2 SMS)
> 99 Consulting Services: Helping businesses improve and scale with IT consulting, managed IT services, SharePoint, identity and access management, cloud and digital solutions. Connect with us for reliable technology support. Call us on 8080803736 or 7770000559

**99StaffingServices** `1677100000000394219` — 275 chars (2 SMS)
> 99 Staffing Services: Simplify your hiring with reliable staffing and recruitment support. We help businesses find suitable talent for their workforce requirements across multiple roles and industries. Connect with us for professional hiring assistance. Call us on 8080803736

**PEG** `1677100000000394325`
> Exact text: see the Property sheet's `SMS Templates` tab / DLT Template Summary. Starts "99 Consulting Services - Property Experts Group. Trusted real estate guidance with 30+ Years Experience…"

**SkylineCapital** `1677100000000394326`
> Exact text: see DLT Template Summary.

## Adding a new template

1. **DLT** → *Content Template Registration* → fill and submit → wait for **Active** + Template ID.
2. **Telinfy** → *Templates → Add Template* → same ID, route, sender, **exact** text → Save → re-check the saved text in the list.
3. **Sheet** → *SMS → Templates (add / edit)…* → add a row (Active = Yes).
4. *SMS → Send test SMS* to your own number in Live mode → check *Telinfy → Campaigns* after ~15 min.

## Writing templates that get approved

- Identify the business (name) and give a contact number — approvals were quick for that pattern.
- Use `{#var#}` only where content genuinely varies; > 2 variables needs a justification.
- Keep under 160 characters to pay for 1 SMS instead of 2.
- Pick **Service Implicit** for people who already contacted you (works on DND numbers); **Promotional** for cold outreach.
