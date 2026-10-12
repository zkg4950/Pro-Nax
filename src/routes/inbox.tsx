/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { createFileRoute } from "@tanstack/react-router";
import Inbox from "@/features/pages/Inbox";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — ProNax" },
      { name: "description", content: "Your ProNax direct messages, shared videos and creator conversations." },
      { property: "og:title", content: "Inbox — ProNax" },
      { property: "og:description", content: "Your ProNax direct messages, shared videos and creator conversations." },
    ],
  }),
  component: Inbox,
});
