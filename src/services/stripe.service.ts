// Stripe service facade — re-exports split services (connect=freelancer, client=card)
export { getConnectStatusService as getStripeStatusService, createConnectOnboardingService } from "./stripe-connect.service.js";
export { getClientPaymentStatusService, createClientSetupService, syncClientPaymentService } from "./stripe-client.service.js";
export { handleStripeWebhookEvent } from "./stripe-webhook.service.js";
