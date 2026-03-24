"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  getAccounts,
  addAccount,
  updateAccount,
  migrateAndDeleteAccount,
  swapAccountOrder,
} from "@/actions/settings";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";

type Account = {
  id: number;
  name: string;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  initialBalance: number;
};

export default function AccountsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [migrateTarget, setMigrateTarget] = useState<string>("_none_");

  // form state
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formCurrency, setFormCurrency] = useState("EUR");
  const [formBalance, setFormBalance] = useState("0");

  useEffect(() => {
    loadAccounts();
  }, []);

  function loadAccounts() {
    startTransition(async () => {
      const data = await getAccounts();
      setAccounts(data);
    });
  }

  function openAdd() {
    setEditId(null);
    setFormName("");
    setFormCurrency("EUR");
    setFormBalance("0");
    setDialogOpen(true);
  }

  function openEdit(acc: Account) {
    setEditId(acc.id);
    setFormName(acc.name);
    setFormCurrency(acc.currency);
    setFormBalance(String(acc.initialBalance));
    setDialogOpen(true);
  }

  function handleSave() {
    startTransition(async () => {
      if (editId) {
        await updateAccount(editId, {
          name: formName,
          currency: formCurrency,
          initialBalance: parseFloat(formBalance) || 0,
        });
      } else {
        await addAccount({
          name: formName,
          currency: formCurrency,
          initialBalance: parseFloat(formBalance) || 0,
        });
      }
      setDialogOpen(false);
      loadAccounts();
    });
  }

  function openDeleteDialog(acc: Account) {
    setDeletingAccount(acc);
    setMigrateTarget("_none_");
    setDeleteDialogOpen(true);
  }

  function handleConfirmDelete() {
    if (!deletingAccount) return;
    startTransition(async () => {
      await migrateAndDeleteAccount(
        deletingAccount.id,
        migrateTarget === "_none_" ? null : migrateTarget,
      );
      setDeleteDialogOpen(false);
      setDeletingAccount(null);
      loadAccounts();
    });
  }

  function handleToggleActive(acc: Account) {
    startTransition(async () => {
      await updateAccount(acc.id, { isActive: !acc.isActive });
      loadAccounts();
    });
  }

  function handleMoveUp(idx: number) {
    if (idx <= 0) return;
    startTransition(async () => {
      await swapAccountOrder(accounts[idx].id, accounts[idx - 1].id);
      loadAccounts();
    });
  }

  function handleMoveDown(idx: number) {
    if (idx >= accounts.length - 1) return;
    startTransition(async () => {
      await swapAccountOrder(accounts[idx].id, accounts[idx + 1].id);
      loadAccounts();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t("accounts_tab")}</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button size="sm" onClick={openAdd}>
              {tc("add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editId ? tc("edit") : tc("add")} {tc("account")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{tc("name")}</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Account name"
                />
              </div>
              <div>
                <Label>{tc("currency")}</Label>
                <Input
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value)}
                  placeholder="EUR"
                />
              </div>
              <div>
                <Label>{tc("amount")}</Label>
                <Input
                  type="number"
                  value={formBalance}
                  onChange={(e) => setFormBalance(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleSave}
                disabled={isPending || !formName.trim()}
              >
                {tc("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground">{tc("no_data")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{tc("name")}</TableHead>
              <TableHead>{tc("currency")}</TableHead>
              <TableHead>{tc("amount")}</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((acc, idx) => (
              <TableRow key={acc.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveUp(idx)}
                      disabled={isPending || idx === 0}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveDown(idx)}
                      disabled={isPending || idx === accounts.length - 1}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{acc.name}</TableCell>
                <TableCell>{acc.currency}</TableCell>
                <TableCell>{acc.initialBalance}</TableCell>
                <TableCell>
                  <Switch
                    checked={acc.isActive}
                    onCheckedChange={() => handleToggleActive(acc)}
                  />
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(acc)}
                    disabled={isPending}
                  >
                    {tc("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => openDeleteDialog(acc)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Delete with migration dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete_account_title")}</DialogTitle>
          </DialogHeader>
          {deletingAccount && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("delete_account_desc", { name: deletingAccount.name })}
              </p>
              <div>
                <Label>{t("migrate_transactions_to")}</Label>
                <Select value={migrateTarget} onValueChange={(v) => v && setMigrateTarget(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">{t("delete_transactions")}</SelectItem>
                    {accounts
                      .filter((a) => a.id !== deletingAccount.id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.name}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isPending}
            >
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
