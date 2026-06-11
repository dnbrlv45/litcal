// Client-safe constants — no Prisma, no Node.js imports.
import type { DiscoveryType, DiscoveryDirection, DiscoveryStatus, ExtensionAppliesTo } from "@prisma/client";

export const DISCOVERY_TYPE_LABELS: Record<DiscoveryType, string> = {
  FORM_INTERROGATORIES:                  "Form Interrogatories",
  SPECIAL_INTERROGATORIES:               "Special Interrogatories",
  REQUESTS_FOR_PRODUCTION:               "Requests for Production",
  REQUESTS_FOR_ADMISSION:                "Requests for Admission",
  SUPPLEMENTAL_FORM_INTERROGATORIES:     "Supplemental Form Interrogatories",
  SUPPLEMENTAL_SPECIAL_INTERROGATORIES:  "Supplemental Special Interrogatories",
  SUPPLEMENTAL_REQUESTS_FOR_PRODUCTION:  "Supplemental Requests for Production",
  SUPPLEMENTAL_REQUESTS_FOR_ADMISSION:   "Supplemental Requests for Admission",
  DEPOSITION_NOTICE:                     "Deposition Notice",
  OTHER:                                 "Other",
};

export const DISCOVERY_DIRECTION_LABELS: Record<DiscoveryDirection, string> = {
  RECEIVED: "Received from Opposing Party",
  SERVED:   "Served on Opposing Party",
};

export const DISCOVERY_STATUS_LABELS: Record<DiscoveryStatus, string> = {
  AWAITING_RESPONSE:  "Awaiting Response",
  RESPONSES_RECEIVED: "Responses Received",
  EXTENSION_GRANTED:  "Extension Granted",
  OVERDUE:            "Overdue",
  COMPLETED:          "Completed",
};

export const EXTENSION_APPLIES_TO_LABELS: Record<ExtensionAppliesTo, string> = {
  OUR_DEADLINE:       "Our Deadline",
  OPPOSING_DEADLINE:  "Opposing Deadline",
  BOTH:               "Both Deadlines",
};
