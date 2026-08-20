v# Project Rules for EV Services Management Platform

## Database Constraints (CRITICAL)
- **NEVER EXECUTE SEED SCRIPTS:** Under no circumstances should you run seed scripts (such as `npm run db:seed`, `prisma db seed`, or any manual seed execution script like `ts-node prisma/seed.ts` or related seeding files). The workspace is connected directly to the production database. Seeding will cause irreversible data duplication or corruption.
- **NO DESTRUCTIVE SCHEMA CHANGES OR PUSHES without explicit permission:** Do not execute `prisma db push` or `prisma migrate` commands without explicit, clear prior warning and confirmation from the developer.
