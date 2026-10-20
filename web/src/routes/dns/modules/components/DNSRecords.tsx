import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import type { DNSRecord, Resource } from "@/lib/api/types";

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
import { toastValidationError } from "@/lib/api/toaster";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { text } from "@/lib/resource-fields";
import { jsonText } from "@/lib/schemas/form-rules";

import { dnsRecordFormSchema } from "../generics";
import { useDNSRecords, useRemoveDNSRecord, useSaveDNSRecord } from "../hooks";
import { DNSRecordForm } from "./DNSRecordForm";

export function DNSRecords({ zone }: { zone: Resource }) {
  const changes = useConfigurationChanges();
  const { record: recordId } = useParams();
  const navigate = useNavigate();
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
  const saveRecord = useSaveDNSRecord(zone.id, edit?.id);
  const [deleteId, setDeleteId] = useState("");
  function save() {
    if (!edit || saveRecord.isPending) return;
    let data;
    if (extra.trim()) {
      const parsed = jsonText.safeParse(extra);
      if (!parsed.success) {
        toastValidationError(parsed.error);
        return;
      }
      data = parsed.data;
    }
    const record = dnsRecordFormSchema.safeParse({ ...edit, data });
    if (!record.success) {
      toastValidationError(record.error);
      return;
    }
    saveRecord.mutate(record.data, {
      onSuccess: () => {
        setEdit(null);
        changes.saved();
        navigate(`/dns/${zone.id}`);
      },
    });
  }
  function confirmRemoval() {
    removeRecord.mutate(deleteId, { onSuccess: () => setDeleteId("") });
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
              busy={saveRecord.isPending}
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
        pending={removeRecord.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}
