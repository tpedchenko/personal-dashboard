import { Card } from "@/components/ui/card";

export default function VersionPage() {
  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <h2 className="text-xl font-bold">Personal Dashboard</h2>
        <p className="text-muted-foreground mt-1">v0.04</p>
        <p className="text-sm text-muted-foreground mt-4">
          Next.js &bull; React &bull; Prisma &bull; Tailwind CSS
        </p>
      </Card>
    </div>
  );
}
