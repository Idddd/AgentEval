import { LazyLog, ScrollFollow } from "@melloware/react-logviewer";

export default function ReactLogViewer({ live, text }: { live: boolean; text: string }) {
  return (
    <ScrollFollow
      startFollowing={live}
      render={({ follow, onScroll }) => (
        <LazyLog
          text={text}
          follow={live && follow}
          onScroll={onScroll}
          enableLineNumbers
          extraLines={1}
          height="auto"
          width="100%"
          rowHeight={24}
          selectableLines
          wrapLines
          style={{ backgroundColor: "#09090b", color: "#e4e4e7" }}
        />
      )}
    />
  );
}
