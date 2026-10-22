import type { MouseEvent } from "react";

import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import type { DNSRecord, Resource } from "@/lib/api/types";

import { toastValidationError } from "@/lib/api/toaster";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { text } from "@/lib/resource-fields";
import { jsonText } from "@/lib/schemas/form-rules";

import { dnsRecordFormSchema } from "../generics";
import { useDNSRecords } from "./useDNSRecords";
import { useRemoveDNSRecord } from "./useRemoveDNSRecord";
import { useSaveDNSRecord } from "./useSaveDNSRecord";
export function useDNSRecordsPage(zone: Resource) {
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
  let edit = current.edit;
  if (edit === null && recordId === "new") {
    edit = {
      type: "A",
      name: String(zone.data.domain),
      content: "",
      ttl: 120,
      proxied: false,
    };
  } else if (edit === null && recordId) {
    edit = q.data?.find((record) => record.id === recordId) ?? null;
  }
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
    if (removeRecord.isPending) return;
    removeRecord.mutate(deleteId, { onSuccess: () => setDeleteId("") });
  }

  function addRecord() {
    setEdit({
      type: "A",
      name: text(zone.data, "domain"),
      content: "",
      ttl: 120,
      proxied: false,
    });
    setExtra("");
    navigate("/dns/" + zone.id + "/records/new");
  }
  function refreshRecords() {
    void q.refetch();
  }
  function handleOpenChange(open: boolean) {
    if (!open) {
      setEdit(null);
      navigate("/dns/" + zone.id);
    }
  }
  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDeleteId("");
  }
  function handleRecordAction(event: MouseEvent<HTMLTableSectionElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-record-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const record = q.data?.find(
      (entry) => entry.id === button.dataset.recordId,
    );
    if (!record) return;
    if (button.dataset.action === "delete") setDeleteId(record.id || "");
    if (button.dataset.action === "edit") {
      setEdit(record);
      navigate("/dns/" + zone.id + "/records/" + record.id);
      setExtra(record.data ? JSON.stringify(record.data, null, 2) : "");
    }
  }
  return {
    state: { edit, extra, deleteId },
    derived: { q, recordId, saveRecord, removeRecord },
    handlers: {
      setEdit,
      setExtra,
      save,
      navigate,
      confirmRemoval,
      addRecord,
      refreshRecords,
      handleOpenChange,
      handleDeleteOpenChange,
      handleRecordAction,
    },
  };
}
