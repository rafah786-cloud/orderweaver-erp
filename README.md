# Mattress Maestro ERP

Build a business ERP web app for a mattress manufacturing company with the following modules:

1. Sales & Invoicing — Party master with outstanding balance tracking. Block new invoices if party outstanding ≥ ₹1,50,000 OR if outstanding ≥ ₹50,000 is older than 90 days. Show warning with reason on block.

2. Production Module — Sales orders trigger production orders. Track order status: Received → In Production → QC → Ready → Dispatched. Sales team can view live production status of their orders.

3. HR & Attendance — Employee master, daily attendance register (manual + CSV import for biometric device export). Auto-calculate monthly salary and daily wages from attendance. Configurable pay structure per employee.

4. Role-Based Access — Roles: Admin (full dashboard), Sales Staff (own orders + customer data), Production Staff (production module only), HR Staff (attendance + payroll), Customer (own orders only), Employee (own payslips + attendance). Registration requires admin approval before login is granted.

5. Admin Dashboard — Full overview: outstanding receivables, production pipeline, attendance summary, top customers by sales.

Use React frontend, Supabase for database and auth. Clean professional UI.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://orderweaver-erp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7c6c0105-316e-4c43-b2cb-5799af1e3805).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
