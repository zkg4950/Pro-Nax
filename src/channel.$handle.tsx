import { createFileRoute } from "@tanstack/react-router";
import Channel from "@/features/pages/Channel";

export const Route = createFileRoute("/channel/$handle")({
  head: ({ params }) => {
    const handle = (params.handle ?? "").replace(/^@/, "");
    const title = `@${handle} — ProNax Channel`;
    const description = `Watch videos, shorts, live streams and playlists from @${handle} on ProNax.`;
    const url = `https://github.com/zkg4950/Pro-Nax/channel/${handle}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            url,
            mainEntity: {
              "@type": "Person",
              name: `@${handle}`,
              alternateName: handle,
              identifier: handle,
              url,
            },
          }),
        },
      ],
    };
  },
  component: Channel,
});
