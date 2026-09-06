import { useMemo } from "react";
import { getMockMediaPosts, type MediaSource } from "../../lib/mediaTracking";

interface MediaTrackingProps {
  companyName: string;
}

const SOURCE_LABEL: Record<MediaSource, string> = {
  reddit: "Reddit",
  discord: "Discord",
};

export function MediaTracking({ companyName }: MediaTrackingProps) {
  const posts = useMemo(() => getMockMediaPosts(companyName), [companyName]);

  const counts = useMemo(() => {
    const bySource: Record<MediaSource, number> = { reddit: 0, discord: 0 };
    for (const post of posts) bySource[post.source]++;
    return bySource;
  }, [posts]);

  return (
    <div className="media-tracking">
      <h3 className="card__title">
        Media tracking <span className="tag media-tracking__preview-tag">Preview</span>
      </h3>

      <p className="media-tracking__description">
        Mocked — scraped posts mentioning {companyName} from communities we monitor. Not wired to a live source yet.
      </p>

      <div className="media-tracking__sources">
        {(Object.keys(counts) as MediaSource[]).map((source) => (
          <span key={source} className={`media-tracking__source-chip media-tracking__source-chip--${source}`}>
            {SOURCE_LABEL[source]} · {counts[source]} posts
          </span>
        ))}
      </div>

      <ul className="media-tracking__posts">
        {posts.map((post) => (
          <li key={post.id} className="media-tracking__post">
            <span className={`media-tracking__source-tag media-tracking__source-tag--${post.source}`}>
              {SOURCE_LABEL[post.source]}
            </span>
            <span className="media-tracking__post-main">
              <span className="media-tracking__post-channel">{post.channel}</span>
              <span className="media-tracking__post-snippet">{post.snippet}</span>
            </span>
            <span className="media-tracking__post-time">{post.timeAgo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
