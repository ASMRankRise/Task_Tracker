import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClockIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "../common/Icons";
import { getEntityId } from "./chatHelpers";
import {
  ALL_STICKERS,
  STICKER_MAP,
  STICKER_PACKS,
  getRecentStickerIds,
  getStickerUrl,
} from "./stickerCatalog";
import { processStickerFile } from "./stickerImageUtils";

export function StickerPicker({
  onSelectSticker,
  onClose,
  disabled = false,
  customStickers = [],
  currentUser = null,
  onUploadSticker,
  onDeleteSticker,
}) {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentUserId = getEntityId(currentUser);
  const isSuperAdmin = currentUser?.role === "superadmin";

  const [recentIds, setRecentIds] = useState(() =>
    getRecentStickerIds(customStickers),
  );
  const [activeTab, setActiveTab] = useState(() =>
    getRecentStickerIds(customStickers).length > 0 ? "recent" : STICKER_PACKS[0].id,
  );
  const [query, setQuery] = useState("");

  // Custom sticker upload mode state
  const [uploadMode, setUploadMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [addWhiteBorder, setAddWhiteBorder] = useState(true);
  const [previewData, setPreviewData] = useState(null);
  const [stickerLabel, setStickerLabel] = useState("");
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    setRecentIds(getRecentStickerIds(customStickers));
  }, [customStickers]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (uploadMode) {
          setUploadMode(false);
        } else {
          onClose?.();
        }
      }
    };
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (e.target.closest?.("[data-sticker-toggle='true']")) return;
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, uploadMode]);

  // Re-process preview whenever selectedFile or addWhiteBorder changes
  useEffect(() => {
    if (!selectedFile) {
      setPreviewData(null);
      return undefined;
    }
    let cancelled = false;
    setProcessing(true);
    setUploadError("");
    processStickerFile(selectedFile, { addWhiteBorder })
      .then((res) => {
        if (cancelled) return;
        setPreviewData(res);
        setStickerLabel((prev) => (prev.trim() ? prev : res.suggestedLabel));
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewData(null);
        setUploadError(err.message || "Could not process image.");
      })
      .finally(() => {
        if (!cancelled) setProcessing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, addWhiteBorder]);

  const normalizedCustomStickers = useMemo(
    () =>
      (Array.isArray(customStickers) ? customStickers : []).map((s) => ({
        ...s,
        url: getStickerUrl(s.id) || s.url,
        packId: "custom",
        packName: "Custom",
        keywords: [s.label, s.uploadedBy?.name || "custom"],
      })),
    [customStickers],
  );

  const customMap = useMemo(
    () => new Map(normalizedCustomStickers.map((s) => [s.id, s])),
    [normalizedCustomStickers],
  );

  const trimmedQuery = query.trim().toLowerCase();

  const displayedStickers = useMemo(() => {
    if (trimmedQuery) {
      const combined = [...normalizedCustomStickers, ...ALL_STICKERS];
      return combined.filter(
        (s) =>
          s.label.toLowerCase().includes(trimmedQuery) ||
          s.packName.toLowerCase().includes(trimmedQuery) ||
          (s.keywords || []).some((kw) =>
            String(kw).toLowerCase().includes(trimmedQuery),
          ),
      );
    }

    if (activeTab === "recent") {
      return recentIds
        .map((id) => STICKER_MAP.get(id) || customMap.get(id))
        .filter(Boolean);
    }

    if (activeTab === "custom") {
      return normalizedCustomStickers;
    }

    const pack = STICKER_PACKS.find((p) => p.id === activeTab);
    if (!pack) return [];
    return pack.stickers.map((s) => STICKER_MAP.get(s.id)).filter(Boolean);
  }, [trimmedQuery, activeTab, recentIds, normalizedCustomStickers, customMap]);

  const activePackLabel = useMemo(() => {
    if (trimmedQuery) {
      return `Search results (${displayedStickers.length})`;
    }
    if (activeTab === "recent") return "Recently Used";
    if (activeTab === "custom") {
      return `Team Custom Stickers (${normalizedCustomStickers.length})`;
    }
    return STICKER_PACKS.find((p) => p.id === activeTab)?.name || "Stickers";
  }, [
    trimmedQuery,
    activeTab,
    displayedStickers.length,
    normalizedCustomStickers.length,
  ]);

  const handlePick = (sticker) => {
    if (disabled) return;
    setRecentIds((prev) =>
      [sticker.id, ...prev.filter((id) => id !== sticker.id)].slice(0, 12),
    );
    onSelectSticker?.(sticker);
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setStickerLabel("");
    setUploadError("");
    setUploadMode(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStickerLabel("");
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!previewData?.dataUrl || !onUploadSticker || uploading) return;
    const trimmed = stickerLabel.trim();
    if (!trimmed) {
      setUploadError("Please enter a short name for this sticker.");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      await onUploadSticker({
        label: trimmed,
        dataUrl: previewData.dataUrl,
      });
      resetUploadForm();
      setActiveTab("custom");
      setQuery("");
    } catch (err) {
      setUploadError(
        err.response?.data?.message || err.message || "Failed to upload sticker.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e, sticker) => {
    e.stopPropagation();
    if (!onDeleteSticker || deletingId) return;
    if (!window.confirm(`Delete custom sticker "${sticker.label}"?`)) return;
    setDeletingId(sticker.id);
    try {
      await onDeleteSticker(sticker.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Sticker picker"
      className="absolute bottom-full left-3 right-3 sm:right-auto sm:w-[356px] mb-2 rounded-xl border border-border bg-surface shadow-xl z-30 overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-subtle px-2.5 py-2">
        {uploadMode ? (
          <div className="flex flex-1 items-center justify-between">
            <span className="text-[12px] font-semibold text-text-primary">
              Add Custom Sticker
            </span>
            <button
              type="button"
              onClick={resetUploadForm}
              className="text-[11px] font-medium text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Back
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-text-tertiary" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stickers..."
                className="h-7.5 w-full rounded-md border border-border bg-surface pl-8 pr-2.5 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand transition-colors"
              />
            </div>

            {onUploadSticker && (
              <button
                type="button"
                onClick={() => {
                  setUploadMode(true);
                  setUploadError("");
                }}
                title="Upload a custom sticker"
                className="inline-flex h-7.5 items-center gap-1 rounded-md border border-brand/30 bg-brand/10 px-2 text-[11px] font-semibold text-brand hover:bg-brand/20 transition-colors cursor-pointer shrink-0"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          title="Close stickers"
          className="rounded-md p-1 text-text-tertiary hover:bg-surface hover:text-text-primary transition-colors cursor-pointer"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {uploadMode ? (
        /* Custom Sticker Upload Form */
        <form onSubmit={handleUploadSubmit} className="p-3 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer?.files?.[0];
              if (dropped) {
                setStickerLabel("");
                setSelectedFile(dropped);
              }
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-subtle/60 p-3 text-center hover:border-brand/60 transition-colors cursor-pointer min-h-[144px]"
          >
            {processing ? (
              <p className="text-[12px] text-text-secondary">
                Optimizing sticker...
              </p>
            ) : previewData?.dataUrl ? (
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="flex h-28 w-28 items-center justify-center rounded-lg p-1.5 border border-border/60"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, rgba(148,163,184,0.16) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.16) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.16) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.16) 75%)",
                    backgroundSize: "12px 12px",
                    backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
                  }}
                >
                  <img
                    src={previewData.dataUrl}
                    alt="Sticker preview"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="text-[11px] text-text-tertiary">
                  {(previewData.sizeBytes / 1024).toFixed(1)} KB · Click to change image
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <PlusIcon className="h-4 w-4" />
                </div>
                <p className="text-[12px] font-medium text-text-primary">
                  Choose or drop an image
                </p>
                <p className="text-[11px] text-text-tertiary">
                  PNG, WebP, JPG, or GIF · Auto-sized to 512×512
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">
              Sticker Name
            </label>
            <input
              type="text"
              maxLength={40}
              value={stickerLabel}
              onChange={(e) => setStickerLabel(e.target.value)}
              placeholder="e.g. RankRise Hype"
              className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[12px] text-text-primary outline-none focus:border-brand"
            />
          </div>

          <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addWhiteBorder}
              onChange={(e) => setAddWhiteBorder(e.target.checked)}
              className="rounded border-border accent-brand"
            />
            <span>Add WhatsApp white die-cut border</span>
          </label>

          {uploadError && (
            <p className="text-[11px] font-medium text-accent">{uploadError}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={resetUploadForm}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!previewData?.dataUrl || !stickerLabel.trim() || processing || uploading}
              className="rounded-md bg-brand hover:bg-brand-hover px-3 py-1.5 text-[12px] font-medium text-brand-text disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {uploading ? "Uploading..." : "Save Sticker"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Pack Tabs (hidden while searching) */}
          {!trimmedQuery && (
            <div className="flex items-center gap-1 border-b border-border bg-surface px-2 py-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("recent")}
                title="Recently Used"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  activeTab === "recent"
                    ? "bg-brand/15 text-brand"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                }`}
              >
                <ClockIcon className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("custom")}
                title="Team Custom Stickers"
                className={`flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                  activeTab === "custom"
                    ? "bg-brand/15 text-brand"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                }`}
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                <span>Custom</span>
                {normalizedCustomStickers.length > 0 && (
                  <span className="rounded-full bg-surface-subtle px-1 text-[10px] text-text-tertiary">
                    {normalizedCustomStickers.length}
                  </span>
                )}
              </button>

              <div className="h-4 w-px bg-border mx-0.5 shrink-0" />

              {STICKER_PACKS.map((pack) => {
                const coverSticker = pack.stickers[0];
                const isSelected = activeTab === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setActiveTab(pack.id)}
                    title={pack.name}
                    className={`flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-brand/15 text-brand"
                        : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                    }`}
                  >
                    <img
                      src={`/stickers/${coverSticker.id}.webp`}
                      alt=""
                      className="h-5 w-5 object-contain shrink-0"
                      draggable={false}
                    />
                    <span className="truncate max-w-[56px]">
                      {pack.name.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pack Label */}
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {activePackLabel}
          </div>

          {/* 4-Column Sticker Grid */}
          <div className="h-60 overflow-y-auto px-2.5 pb-2.5">
            {displayedStickers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-4 gap-2">
                <p className="text-[12px] font-medium text-text-secondary">
                  {trimmedQuery
                    ? `No stickers match "${query.trim()}".`
                    : activeTab === "custom"
                      ? "No custom stickers yet."
                      : "No recent stickers yet."}
                </p>
                {!trimmedQuery && activeTab === "custom" && onUploadSticker ? (
                  <button
                    type="button"
                    onClick={() => setUploadMode(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-brand hover:bg-brand-hover px-3 py-1.5 text-[12px] font-medium text-brand-text cursor-pointer"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    <span>Upload your first sticker</span>
                  </button>
                ) : !trimmedQuery ? (
                  <p className="text-[11px] text-text-tertiary">
                    Pick a pack above — stickers you send will show up here.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {displayedStickers.map((sticker) => {
                  const isCustom = sticker.packId === "custom";
                  const canDeleteCustom =
                    isCustom &&
                    onDeleteSticker &&
                    (isSuperAdmin ||
                      getEntityId(sticker.uploadedBy) === currentUserId);

                  return (
                    <div
                      key={sticker.id}
                      className="group/tile relative aspect-square"
                    >
                      <button
                        type="button"
                        disabled={disabled || deletingId === sticker.id}
                        onClick={() => handlePick(sticker)}
                        title={
                          isCustom && sticker.uploadedBy?.name
                            ? `${sticker.label} (by ${sticker.uploadedBy.name})`
                            : sticker.label
                        }
                        className="flex h-full w-full items-center justify-center rounded-lg p-1.5 hover:bg-surface-subtle active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <img
                          src={sticker.url}
                          alt={sticker.label}
                          loading="lazy"
                          draggable={false}
                          className="h-full w-full object-contain transition-transform duration-150 group-hover/tile:scale-110"
                        />
                      </button>

                      {canDeleteCustom && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, sticker)}
                          disabled={deletingId === sticker.id}
                          title="Delete custom sticker"
                          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-tertiary hover:text-accent hover:border-accent opacity-0 group-hover/tile:opacity-100 transition-opacity shadow-sm cursor-pointer"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default StickerPicker;
