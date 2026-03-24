"use client";

import { useState, useEffect, useCallback } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import {
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  getUserPasskeys,
  deletePasskey,
  renamePasskey,
} from "@/actions/passkey";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Trash2, Pencil, Plus, Shield } from "lucide-react";

type PasskeyInfo = {
  id: string;
  friendlyName: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export default function SecuritySettingsPage() {
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadPasskeys = useCallback(async () => {
    const data = await getUserPasskeys();
    setPasskeys(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  async function handleRegister() {
    setRegistering(true);
    setError("");
    try {
      const { options, error: optErr } = await getPasskeyRegistrationOptions();
      if (optErr || !options) {
        setError(optErr || "Failed to get registration options");
        setRegistering(false);
        return;
      }

      const regResponse = await startRegistration({ optionsJSON: options });
      const result = await verifyPasskeyRegistration(regResponse, newName || undefined);

      if (result.error) {
        setError(result.error);
      } else {
        setNewName("");
        await loadPasskeys();
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "NotAllowedError") {
        // User cancelled
      } else {
        setError("Registration failed");
      }
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this passkey?")) return;
    await deletePasskey(id);
    await loadPasskeys();
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    await renamePasskey(id, editName.trim());
    setEditingId(null);
    setEditName("");
    await loadPasskeys();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security — Passkeys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Passkeys let you sign in with your fingerprint, face, or screen lock. They are more secure than passwords and work across devices.
          </p>

          {/* Register new passkey */}
          <div className="flex gap-2">
            <Input
              placeholder="Passkey name (e.g. MacBook, iPhone)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleRegister} disabled={registering}>
              <Plus className="h-4 w-4 mr-1" />
              {registering ? "..." : "Add Passkey"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* List existing passkeys */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passkeys registered yet.</p>
          ) : (
            <div className="space-y-2">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-5 w-5 text-muted-foreground" />
                    <div>
                      {editingId === pk.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRename(pk.id);
                          }}
                          className="flex gap-2"
                        >
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 text-sm w-40"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" type="submit">
                            Save
                          </Button>
                        </form>
                      ) : (
                        <p className="text-sm font-medium">
                          {pk.friendlyName || "Unnamed passkey"}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {pk.deviceType === "multiDevice" ? "Synced" : "Device-bound"}
                        {pk.backedUp && " (backed up)"}
                        {" · Added "}
                        {new Date(pk.createdAt).toLocaleDateString()}
                        {pk.lastUsedAt && (
                          <> · Last used {new Date(pk.lastUsedAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(pk.id);
                        setEditName(pk.friendlyName || "");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(pk.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
