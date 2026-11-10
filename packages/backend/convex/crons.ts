import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Everyday: check each watching Gmail for new bills.
crons.interval("everyday gmail bills", { minutes: 2 }, internal.everyday.scanAll, {});

// Everyday: invoices sent through PayPal. Paid ones are paid out; overdue ones get a reminder.
crons.interval("everyday invoices", { minutes: 2 }, internal.invoices.checkAll, {});

export default crons;
