import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'bkash/1.2.0-beta (api/6.1.2)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Create Payment (Sale or Authorize)
   *
   */
  createPaymentUsingPOST(body: types.CreatePaymentUsingPostBodyParam, metadata: types.CreatePaymentUsingPostMetadataParam): Promise<FetchResponse<200, types.CreatePaymentUsingPostResponse200>> {
    return this.core.fetch('/checkout/payment/create', 'post', body, metadata);
  }

  /**
   * Execute Payment
   *
   */
  executePaymentUsingPOST(metadata: types.ExecutePaymentUsingPostMetadataParam): Promise<FetchResponse<200, types.ExecutePaymentUsingPostResponse200>> {
    return this.core.fetch('/checkout/payment/execute/{paymentID}', 'post', metadata);
  }

  /**
   * Capture
   *
   */
  capturePaymentUsingPOST(metadata: types.CapturePaymentUsingPostMetadataParam): Promise<FetchResponse<200, types.CapturePaymentUsingPostResponse200>> {
    return this.core.fetch('/checkout/payment/capture/{paymentID}', 'post', metadata);
  }

  /**
   * Query Payment
   *
   */
  queryPaymentUsingGET(metadata: types.QueryPaymentUsingGetMetadataParam): Promise<FetchResponse<200, types.QueryPaymentUsingGetResponse200>> {
    return this.core.fetch('/checkout/payment/query/{paymentID}', 'get', metadata);
  }

  /**
   * Void
   *
   */
  voidPaymentUsingPOST(metadata: types.VoidPaymentUsingPostMetadataParam): Promise<FetchResponse<200, types.VoidPaymentUsingPostResponse200>> {
    return this.core.fetch('/checkout/payment/void/{paymentID}', 'post', metadata);
  }

  /**
   * B2C Payment
   *
   */
  b2cPaymentUsingPOST(body: types.B2CPaymentUsingPostBodyParam, metadata: types.B2CPaymentUsingPostMetadataParam): Promise<FetchResponse<200, types.B2CPaymentUsingPostResponse200>> {
    return this.core.fetch('/checkout/payment/b2cPayment', 'post', body, metadata);
  }

  /**
   * Query Organization Balance
   *
   */
  queryOrganizationBalanceUsingGET(metadata: types.QueryOrganizationBalanceUsingGetMetadataParam): Promise<FetchResponse<200, types.QueryOrganizationBalanceUsingGetResponse200>> {
    return this.core.fetch('/checkout/payment/organizationBalance', 'get', metadata);
  }

  /**
   * Intra-Account Transfer
   *
   */
  intraAccountTransferUsingPOST(body: types.IntraAccountTransferUsingPostBodyParam, metadata: types.IntraAccountTransferUsingPostMetadataParam): Promise<FetchResponse<200, types.IntraAccountTransferUsingPostResponse200>> {
    return this.core.fetch('/checkout/payment/intraAccountTransfer', 'post', body, metadata);
  }

  /**
   * Search Transaction Details
   *
   */
  searchTransactionUsingGET(metadata: types.SearchTransactionUsingGetMetadataParam): Promise<FetchResponse<200, types.SearchTransactionUsingGetResponse200>> {
    return this.core.fetch('/checkout/payment/search/{trxID}', 'get', metadata);
  }

  /**
   * Grant Token
   *
   */
  getTokenUsingPOST(body: types.GetTokenUsingPostBodyParam, metadata: types.GetTokenUsingPostMetadataParam): Promise<FetchResponse<200, types.GetTokenUsingPostResponse200>> {
    return this.core.fetch('/checkout/token/grant', 'post', body, metadata);
  }

  /**
   * Refresh Token
   *
   */
  refreshTokenUsingPOST(body: types.RefreshTokenUsingPostBodyParam, metadata: types.RefreshTokenUsingPostMetadataParam): Promise<FetchResponse<200, types.RefreshTokenUsingPostResponse200>> {
    return this.core.fetch('/checkout/token/refresh', 'post', body, metadata);
  }

  /**
   * Refund
   *
   */
  postCheckoutPaymentRefund(body: types.PostCheckoutPaymentRefundBodyParam, metadata: types.PostCheckoutPaymentRefundMetadataParam): Promise<FetchResponse<200, types.PostCheckoutPaymentRefundResponse200>> {
    return this.core.fetch('/checkout/payment/refund', 'post', body, metadata);
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { B2CPaymentUsingPostBodyParam, B2CPaymentUsingPostMetadataParam, B2CPaymentUsingPostResponse200, CapturePaymentUsingPostMetadataParam, CapturePaymentUsingPostResponse200, CreatePaymentUsingPostBodyParam, CreatePaymentUsingPostMetadataParam, CreatePaymentUsingPostResponse200, ExecutePaymentUsingPostMetadataParam, ExecutePaymentUsingPostResponse200, GetTokenUsingPostBodyParam, GetTokenUsingPostMetadataParam, GetTokenUsingPostResponse200, IntraAccountTransferUsingPostBodyParam, IntraAccountTransferUsingPostMetadataParam, IntraAccountTransferUsingPostResponse200, PostCheckoutPaymentRefundBodyParam, PostCheckoutPaymentRefundMetadataParam, PostCheckoutPaymentRefundResponse200, QueryOrganizationBalanceUsingGetMetadataParam, QueryOrganizationBalanceUsingGetResponse200, QueryPaymentUsingGetMetadataParam, QueryPaymentUsingGetResponse200, RefreshTokenUsingPostBodyParam, RefreshTokenUsingPostMetadataParam, RefreshTokenUsingPostResponse200, SearchTransactionUsingGetMetadataParam, SearchTransactionUsingGetResponse200, VoidPaymentUsingPostMetadataParam, VoidPaymentUsingPostResponse200 } from './types';
