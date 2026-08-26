declare module "midtrans-client" {
  export interface SnapConfig {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  export interface SnapItemDetail {
    id: string;
    price: number;
    quantity: number;
    name: string;
  }

  export interface SnapCustomerDetails {
    first_name?: string;
    email?: string;
    phone?: string;
  }

  export interface SnapTransactionParameter {
    transaction_details: {
      order_id: string;
      gross_amount: number;
    };
    item_details?: SnapItemDetail[];
    customer_details?: SnapCustomerDetails;
  }

  export interface SnapTransactionResult {
    token: string;
    redirect_url: string;
  }

  export class Snap {
    constructor(config: SnapConfig);
    createTransaction(parameter: SnapTransactionParameter): Promise<SnapTransactionResult>;
  }

  const midtransClient: { Snap: typeof Snap };
  export default midtransClient;
}
