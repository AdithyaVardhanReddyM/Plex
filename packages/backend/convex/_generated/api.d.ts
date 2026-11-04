/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as http from "../http.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_policyAi from "../lib/policyAi.js";
import type * as lib_receipts from "../lib/receipts.js";
import type * as lib_taskRules from "../lib/taskRules.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as pots from "../pots.js";
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
  applications: typeof applications;
  http: typeof http;
  "lib/actor": typeof lib_actor;
  "lib/ai": typeof lib_ai;
  "lib/money": typeof lib_money;
  "lib/policy": typeof lib_policy;
  "lib/policyAi": typeof lib_policyAi;
  "lib/receipts": typeof lib_receipts;
  "lib/taskRules": typeof lib_taskRules;
  "lib/viewer": typeof lib_viewer;
  pots: typeof pots;
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
