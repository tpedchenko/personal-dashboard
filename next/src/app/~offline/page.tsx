"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <div className="mb-4 text-5xl" aria-hidden="true">
          &#128225;
        </div>
        <h1 className="text-2xl font-bold">Немає з&#39;єднання</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Ви зараз офлайн. Раніше переглянуті сторінки та дані доступні з кешу.
          Нові дані завантажаться після відновлення з&#39;єднання.
        </p>
        <button
          onClick={() => location.reload()}
          className="mt-6 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
        >
          Спробувати знову
        </button>
      </div>
    </div>
  );
}
