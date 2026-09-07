import { Card } from "@/components/ui-kit";

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export function PageLoadingSkeleton({ title = "加载中" }: { title?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div>
        <Block className="h-8 w-48" />
        <Block className="mt-2 h-4 w-96 max-w-full" />
        <p className="sr-only">{title}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <Block className="h-3 w-20" />
            <Block className="mt-3 h-8 w-16" />
            <Block className="mt-2 h-3 w-28" />
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Block key={index} className="h-9 w-24" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Block key={index} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function TabPanelLoadingSkeleton() {
  return (
    <Card>
      <div className="space-y-3 py-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <Block key={index} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  );
}
