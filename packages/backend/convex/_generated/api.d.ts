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
import type * as connections from "../connections.js";
import type * as hire from "../hire.js";
import type * as houseAgents from "../houseAgents.js";
import type * as http from "../http.js";
import type * as ledger from "../ledger.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_connect from "../lib/connect.js";
import type * as lib_hire from "../lib/hire.js";
import type * as lib_hireSeed from "../lib/hireSeed.js";
import type * as lib_ledgerAi from "../lib/ledgerAi.js";
import type * as lib_ledgerSeed from "../lib/ledgerSeed.js";
import type * as lib_ledgerSpec from "../lib/ledgerSpec.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_paypalDesk from "../lib/paypalDesk.js";
import type * as lib_receipts from "../lib/receipts.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_split from "../lib/split.js";
import type * as lib_taskRules from "../lib/taskRules.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as merchants from "../merchants.js";
import type * as paypalDesk from "../paypalDesk.js";
import type * as paypalDeskData from "../paypalDeskData.js";
import type * as proofs from "../proofs.js";
import type * as receipts from "../receipts.js";
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
  connections: typeof connections;
  hire: typeof hire;
  houseAgents: typeof houseAgents;
  http: typeof http;
  ledger: typeof ledger;
  "lib/actor": typeof lib_actor;
  "lib/ai": typeof lib_ai;
  "lib/connect": typeof lib_connect;
  "lib/hire": typeof lib_hire;
  "lib/hireSeed": typeof lib_hireSeed;
  "lib/ledgerAi": typeof lib_ledgerAi;
  "lib/ledgerSeed": typeof lib_ledgerSeed;
  "lib/ledgerSpec": typeof lib_ledgerSpec;
  "lib/money": typeof lib_money;
  "lib/paypalDesk": typeof lib_paypalDesk;
  "lib/receipts": typeof lib_receipts;
  "lib/secrets": typeof lib_secrets;
  "lib/split": typeof lib_split;
  "lib/taskRules": typeof lib_taskRules;
  "lib/viewer": typeof lib_viewer;
  merchants: typeof merchants;
  paypalDesk: typeof paypalDesk;
  paypalDeskData: typeof paypalDeskData;
  proofs: typeof proofs;
  receipts: typeof receipts;
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
