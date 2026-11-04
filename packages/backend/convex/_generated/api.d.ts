/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_money from "../lib/money.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_policyAi from "../lib/policyAi.js";
import type * as lib_receipts from "../lib/receipts.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as pots from "../pots.js";
import type * as receipts from "../receipts.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/money": typeof lib_money;
  "lib/policy": typeof lib_policy;
  "lib/policyAi": typeof lib_policyAi;
  "lib/receipts": typeof lib_receipts;
  "lib/viewer": typeof lib_viewer;
  pots: typeof pots;
  receipts: typeof receipts;
  seed: typeof seed;
  users: typeof users;
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
