/** @format */

export interface SePayWebhookPayload {
    id: number;
    gateway: string;
    transactionDate: string;
    accountNumber: string;
    subAccount: string | null;
    code: string | null;
    content: string;
    transferType: "in" | "out";
    description: string;
    transferAmount: number;
    referenceCode: string;
    accumulated: number;
    id_transaction: number;
    transferDate?: string;
}

export const buildSePayContent = (orderCode: string): string => {
    return `Thanh toan Lamine Sport - ${orderCode}`;
};

export const buildSePayQrUrl = (params: { amount: number; orderCode: string }): string => {
    const bankCode = process.env.SEPAY_BANK_CODE!;
    const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER!;
    const content = buildSePayContent(params.orderCode);

    const query = new URLSearchParams({
        bank: bankCode,
        acc: accountNumber,
        template: "compact",
        amount: String(params.amount),
        des: content,
    });

    return `https://qr.sepay.vn/img?${query.toString()}`;
};

export const verifySePayWebhook = (apiKey: string): boolean => {
    return apiKey === process.env.SEPAY_API_KEY;
};
