---
"@optik/api": minor
---

High availability: the limit for failed sign-ins is shared by all instances (database), so optik is stateless behind a load balancer. The Helm chart adds autoscaling, a PodDisruptionBudget and spreading over nodes and zones for several replicas. New guide docs/operations.md for high availability, backup and restore.
