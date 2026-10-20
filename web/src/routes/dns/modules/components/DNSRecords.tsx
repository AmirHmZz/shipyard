import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import type { DNSRecord, Resource } from "@/lib/api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { Confirm, ErrorState, Loading } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, text } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { dnsRecordFormSchema, jsonText } from "@/lib/validation";

import { dnsKeys } from "../generics";
import { useDNSRecords, useRemoveDNSRecord } from "../hooks";
import { saveDNSRecord } from "../services";
import { DNSRecordForm } from "./DNSRecordForm";

export function DNSRecords({ zone }: { zone: Resource }) {
  const changes = useConfigurationChanges();
  const { record: recordId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const q = useDNSRecords(zone);
  const removeRecord = useRemoveDNSRecord(zone.id);
  const [draft, setDraft] = useState<{
    recordId: string | undefined;
    edit: DNSRecord | null;
    extra: string | undefined;
  }>({ recordId, edit: null, extra: undefined });
  const current =
    draft.recordId === recordId
      ? draft
      : { recordId, edit: null, extra: undefined };
  const edit =
    current.edit ??
    (recordId === "new"
      ? {
          type: "A",
          name: String(zone.data.domain),
          content: "",
          ttl: 120,
          proxied: false,
        }
      : recordId
        ? q.data?.find((r) => r.id === recordId)
        : null) ??
    null;
  const extra =
    current.extra ?? (edit?.data ? JSON.stringify(edit.data, null, 2) : "");
  function setEdit(edit: DNSRecord | null) {
    setDraft((previous) => ({
      ...(previous.recordId === recordId
        ? previous
        : { recordId, extra: undefined }),
      edit,
    }));
  }
  function setExtra(extra: string) {
    setDraft((previous) => ({
      ...(previous.recordId === recordId ? previous : { recordId, edit: null }),
      extra,
    }));
  }
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const data = extra.trim() ? jsonText.parse(extra) : undefined;
      const record = dnsRecordFormSchema.parse({ ...edit, data });
      await saveDNSRecord(zone.id, edit, record);
      await client.invalidateQueries({ queryKey: dnsKeys.records(zone.id) });
      setEdit(null);
      changes.saved();
      navigate(`/dns/${zone.id}`);
      toast.success("DNS record saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!recordId && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              {q.isFetching ? <Spinner className="size-4" /> : <RefreshCw />}
              Refresh records
            </Button>
            <Button
              disabled={!zone.canWrite}
              onClick={() => {
                setEdit({
                  type: "A",
                  name: text(zone.data, "domain"),
                  content: "",
                  ttl: 120,
                  proxied: false,
                });
                setExtra("");
                navigate(`/dns/${zone.id}/records/new`);
              }}
            >
              <Plus />
              Add record
            </Button>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : (
            <Card className="gap-0 overflow-hidden py-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead>Proxy</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data?.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {record.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{record.name}</TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs">
                        {record.content || JSON.stringify(record.data)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {record.ttl === 1 ? "Auto" : record.ttl}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {record.proxied ? "Proxied" : "DNS only"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={!zone.canWrite}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEdit(record);
                            navigate(`/dns/${zone.id}/records/${record.id}`);
                            setExtra(
                              record.data
                                ? JSON.stringify(record.data, null, 2)
                                : "",
                            );
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          disabled={!zone.canWrite}
                          variant="ghost"
                          size="icon"
                          aria-label="Delete DNS record"
                          onClick={() => setDeleteId(record.id || "")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!q.data?.length && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No records in this zone.
                </div>
              )}
            </Card>
          )}
        </>
      )}
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) {
            setEdit(null);
            navigate(`/dns/${zone.id}`);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "New"} DNS record</DialogTitle>
            <DialogDescription>
              Provider-specific values are preserved when editing an existing
              record.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <DNSRecordForm
              edit={edit}
              setEdit={setEdit}
              extra={extra}
              setExtra={setExtra}
              busy={busy}
              save={save}
              navigate={navigate}
              zone={zone}
            />
          )}
        </DialogContent>
      </Dialog>
      <Confirm
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId("")}
        title="Delete this DNS record?"
        description="This removes the record from your DNS provider."
        destructive
        onConfirm={async () => {
          await removeRecord.mutateAsync(deleteId);
        }}
      />
    </>
  );
}
