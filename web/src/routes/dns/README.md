# DNS

URLs: /dns, /dns/:id, /dns/:id/records/:record.

The list, zone, and record routes share DNSMainView and its existing param branch.

Endpoints: `/resources`, `/zones/:id/records`, `/zones/:id/certificates`, and record writes.
Key modules: `DNSMainView`, `DNSRecords`, `DNSRecordSurface`, `ZoneCertificates`, shared hooks/services.
