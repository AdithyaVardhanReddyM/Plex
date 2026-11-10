/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentApi from "../agentApi.js";
import type * as agentBuilder from "../agentBuilder.js";
import type * as agentConnect from "../agentConnect.js";
import type * as apiKeys from "../apiKeys.js";
import type * as applications from "../applications.js";
import type * as autopay from "../autopay.js";
import type * as backing from "../backing.js";
import type * as connections from "../connections.js";
import type * as crews from "../crews.js";
import type * as crons from "../crons.js";
import type * as everyday from "../everyday.js";
import type * as externalAgents from "../externalAgents.js";
import type * as githubOAuth from "../githubOAuth.js";
import type * as hire from "../hire.js";
import type * as home from "../home.js";
import type * as houseAgents from "../houseAgents.js";
import type * as http from "../http.js";
import type * as invoices from "../invoices.js";
import type * as ledger from "../ledger.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_answers from "../lib/answers.js";
import type * as lib_bills from "../lib/bills.js";
import type * as lib_connect from "../lib/connect.js";
import type * as lib_crew from "../lib/crew.js";
import type * as lib_google from "../lib/google.js";
import type * as lib_hire from "../lib/hire.js";
import type * as lib_hireSeed from "../lib/hireSeed.js";
import type * as lib_ledgerAi from "../lib/ledgerAi.js";
import type * as lib_ledgerSeed from "../lib/ledgerSeed.js";
import type * as lib_ledgerSpec from "../lib/ledgerSpec.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_paypalDesk from "../lib/paypalDesk.js";
import type * as lib_profile from "../lib/profile.js";
import type * as lib_receipts from "../lib/receipts.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_split from "../lib/split.js";
import type * as lib_taskRules from "../lib/taskRules.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as merchants from "../merchants.js";
import type * as onboarding from "../onboarding.js";
import type * as paypalDesk from "../paypalDesk.js";
import type * as paypalDeskData from "../paypalDeskData.js";
import type * as proofs from "../proofs.js";
import type * as receipts from "../receipts.js";
import type * as reconcile from "../reconcile.js";
import type * as seed from "../seed.js";
import type * as taskMoney from "../taskMoney.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentApi: typeof agentApi;
  agentBuilder: typeof agentBuilder;
  agentConnect: typeof agentConnect;
  apiKeys: typeof apiKeys;
  applications: typeof applications;
  autopay: typeof autopay;
  backing: typeof backing;
  connections: typeof connections;
  crews: typeof crews;
  crons: typeof crons;
  everyday: typeof everyday;
  externalAgents: typeof externalAgents;
  githubOAuth: typeof githubOAuth;
  hire: typeof hire;
  home: typeof home;
  houseAgents: typeof houseAgents;
  http: typeof http;
  invoices: typeof invoices;
  ledger: typeof ledger;
  "lib/actor": typeof lib_actor;
  "lib/ai": typeof lib_ai;
  "lib/answers": typeof lib_answers;
  "lib/bills": typeof lib_bills;
  "lib/connect": typeof lib_connect;
  "lib/crew": typeof lib_crew;
  "lib/google": typeof lib_google;
  "lib/hire": typeof lib_hire;
  "lib/hireSeed": typeof lib_hireSeed;
  "lib/ledgerAi": typeof lib_ledgerAi;
  "lib/ledgerSeed": typeof lib_ledgerSeed;
  "lib/ledgerSpec": typeof lib_ledgerSpec;
  "lib/money": typeof lib_money;
  "lib/paypalDesk": typeof lib_paypalDesk;
  "lib/profile": typeof lib_profile;
  "lib/receipts": typeof lib_receipts;
  "lib/secrets": typeof lib_secrets;
  "lib/split": typeof lib_split;
  "lib/taskRules": typeof lib_taskRules;
  "lib/viewer": typeof lib_viewer;
  merchants: typeof merchants;
  onboarding: typeof onboarding;
  paypalDesk: typeof paypalDesk;
  paypalDeskData: typeof paypalDeskData;
  proofs: typeof proofs;
  receipts: typeof receipts;
  reconcile: typeof reconcile;
  seed: typeof seed;
  taskMoney: typeof taskMoney;
  tasks: typeof tasks;
  users: typeof users;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
