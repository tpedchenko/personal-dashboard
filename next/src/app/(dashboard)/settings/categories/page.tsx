"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getAllCategoriesFromTransactions,
  getFavourites,
  toggleFavourite,
  renameCategory,
  getCategoryUsageStats,
  addCategory,
  getCategoryTypes,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { StarIcon, PencilIcon, CheckIcon, XIcon, BarChart3Icon, PlusIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CategoriesPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [categories, setCategories] = useState<string[]>([]);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [search, setSearch] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const [usageStats, setUsageStats] = useState<{ category: string; count: number; lastUsed: string | null }[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [categoryTypes, setCategoryTypes] = useState<Record<string, "EXPENSE" | "INCOME" | "MIXED">>({});

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    startTransition(async () => {
      const [cats, favs, types] = await Promise.all([
        getAllCategoriesFromTransactions(),
        getFavourites(),
        getCategoryTypes(),
      ]);
      setCategories(cats);
      setFavourites(new Set(favs.map((f) => f.category)));
      setCategoryTypes(types);
    });
  }

  function handleToggleFav(category: string) {
    startTransition(async () => {
      await toggleFavourite(category);
      loadData();
    });
  }

  function startEdit(category: string) {
    setEditingCat(category);
    setEditValue(category);
  }

  function cancelEdit() {
    setEditingCat(null);
    setEditValue("");
  }

  function saveEdit(oldName: string) {
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      cancelEdit();
      return;
    }
    if (categories.includes(newName)) {
      toast.error("Category already exists");
      return;
    }
    startTransition(async () => {
      await renameCategory(oldName, newName);
      setEditingCat(null);
      setEditValue("");
      toast.success("Category renamed");
      loadData();
    });
  }

  // Sort: favourites first, then alphabetically
  const sortedCategories = [...categories].sort((a, b) => {
    const aFav = favourites.has(a) ? 0 : 1;
    const bFav = favourites.has(b) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.localeCompare(b);
  });

  // Group by parent category (before " / ")
  const grouped = new Map<string, string[]>();
  for (const cat of sortedCategories) {
    const parts = cat.split(" / ");
    const parent = parts.length > 1 ? parts[0] : "";
    if (!grouped.has(parent)) grouped.set(parent, []);
    grouped.get(parent)!.push(cat);
  }

  const filtered = search
    ? sortedCategories.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : null;

  const displayList = filtered ?? sortedCategories;

  function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (categories.includes(name)) {
      toast.error("Category already exists");
      return;
    }
    startTransition(async () => {
      await addCategory(name);
      setNewCatName("");
      toast.success(tc("saved"));
      loadData();
    });
  }

  return (
    <div className="space-y-4">
      {/* Add Category Form */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("add_category")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>{tc("name")}</Label>
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder={tc("category")}
            />
          </div>
          <div>
            <Label>{tc("type")}</Label>
            <Select value={newCatType} onValueChange={(v) => setNewCatType(v as "EXPENSE" | "INCOME")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">{t("expenses")}</SelectItem>
                <SelectItem value="INCOME">{t("income")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleAddCategory} disabled={isPending || !newCatName.trim()}>
              <PlusIcon className="size-4 mr-1" />
              {tc("add")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("categories_tab")}</h2>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${tc("search")}...`}
          className="max-w-sm"
        />

        <p className="text-sm text-muted-foreground">
          {categories.length} {t("categories").toLowerCase()}
          {favourites.size > 0 && ` · ${favourites.size} ⭐`}
        </p>

        {displayList.length === 0 ? (
          <p className="text-muted-foreground">{tc("no_data")}</p>
        ) : (
          <div className="space-y-0.5">
            {displayList.map((cat) => {
              const isFav = favourites.has(cat);
              const isEditing = editingCat === cat;

              return (
                <div
                  key={cat}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group"
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(cat);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <Button variant="ghost" size="sm" onClick={() => saveEdit(cat)} disabled={isPending}>
                        <CheckIcon className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <button
                          onClick={() => handleToggleFav(cat)}
                          disabled={isPending}
                          className="shrink-0"
                        >
                          <StarIcon
                            className={`size-4 ${isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                          />
                        </button>
                        <span>{cat}</span>
                        {categoryTypes[cat] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            categoryTypes[cat] === "INCOME"
                              ? "bg-income/15 text-income"
                              : categoryTypes[cat] === "MIXED"
                                ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                                : "bg-expense/15 text-expense"
                          }`}>
                            {categoryTypes[cat] === "INCOME" ? t("income") : categoryTypes[cat] === "MIXED" ? "Mixed" : t("expenses")}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => startEdit(cat)}
                        disabled={isPending}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Category Usage Frequency */}
      <Card className="p-4">
        <button
          onClick={() => {
            if (!showUsage) {
              startTransition(async () => {
                const stats = await getCategoryUsageStats();
                setUsageStats(stats);
                setShowUsage(true);
              });
            } else {
              setShowUsage(false);
            }
          }}
          className="flex items-center gap-2 w-full text-left font-medium"
        >
          <BarChart3Icon className="size-4" />
          {t("category_usage")}
          <span className="text-muted-foreground ml-auto">{showUsage ? "▲" : "▼"}</span>
        </button>
        {showUsage && usageStats.length > 0 && (
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>{t("categories")}</TableHead>
                <TableHead className="text-right">{t("tx_count")}</TableHead>
                <TableHead className="text-right">{t("last_used")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageStats.map((stat) => (
                <TableRow key={stat.category}>
                  <TableCell className="text-sm">{stat.category}</TableCell>
                  <TableCell className="text-right text-sm">{stat.count}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{stat.lastUsed ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
