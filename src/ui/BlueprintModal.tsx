/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Blueprint JSON v1.0 Import/Export Modal with Real-time Validation.
 */

import React, { useState } from "react";
import {
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Upload,
  X,
  Wand2,
} from "lucide-react";
import { VideoBlueprint, ValidationResult } from "../types/blueprint";
import { validateBlueprint } from "../core/validator";

export interface BlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBlueprint: VideoBlueprint;
  actualAudioDuration?: number;
  onApplyBlueprint: (blueprint: VideoBlueprint) => void;
}

export const BlueprintModal: React.FC<BlueprintModalProps> = ({
  isOpen,
  onClose,
  currentBlueprint,
  actualAudioDuration,
  onApplyBlueprint,
}) => {
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(currentBlueprint, null, 2));
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  if (!isOpen) return null;

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const res = validateBlueprint(parsed, { actualAudioDuration, autoRepair: true });
      setValidationResult(res);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errors: [
          {
            severity: "error",
            code: "SYNTAX_ERROR",
            field: "JSON",
            message: `Invalid JSON syntax: ${err.message}`,
          },
        ],
        warnings: [],
      });
    }
  };

  const handleApply = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const res = validateBlueprint(parsed, { actualAudioDuration, autoRepair: true });
      if (res.repairedBlueprint) {
        onApplyBlueprint(res.repairedBlueprint);
        onClose();
      } else if (res.valid) {
        onApplyBlueprint(parsed);
        onClose();
      } else {
        setValidationResult(res);
      }
    } catch (err: any) {
      alert("Invalid JSON format: " + err.message);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentBlueprint.project.id || "blueprint"}-v1.0.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      setJsonText(text);
      try {
        const parsed = JSON.parse(text);
        setValidationResult(validateBlueprint(parsed, { actualAudioDuration, autoRepair: true }));
      } catch (err: any) {
        setValidationResult({
          valid: false,
          errors: [{ severity: "error", code: "SYNTAX_ERROR", field: "JSON", message: err.message }],
          warnings: [],
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0b0f1d] border border-[#232d47] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden text-[13px]">
        {/* Header */}
        <div className="p-4 border-b border-[#1e2740] flex items-center justify-between bg-[#080c18]">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-[#38bdf8]" />
            <span className="font-extrabold text-white text-[15px]">CutFree Video Blueprint JSON v1.0</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#8d9cc2] hover:text-white hover:bg-[#151b2e]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-4 py-2.5 bg-[#0e1426] border-b border-[#1e2740] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-lg bg-[#151b2e] border border-[#232d47] hover:border-[#38bdf8] text-[#cbd5e1] font-semibold text-[12px] flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Open JSON File</span>
              <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
            </label>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg bg-[#151b2e] border border-[#232d47] hover:border-[#38bdf8] text-[#cbd5e1] font-semibold text-[12px] flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={handleValidate}
              className="px-3 py-1.5 rounded-lg bg-[#151b2e] border border-[#232d47] hover:border-[#5b8dff] text-[#93c5fd] font-semibold text-[12px] flex items-center gap-1.5"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Validate Blueprint</span>
            </button>
          </div>

          {actualAudioDuration && actualAudioDuration > 0 && (
            <div className="text-[11px] text-[#2dd4bf] bg-[#0d2a29] border border-[#134e4a] px-2.5 py-1 rounded-md font-mono">
              Authoritative Audio: {actualAudioDuration.toFixed(2)}s
            </div>
          )}
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex min-h-0">
          {/* JSON Textarea */}
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setValidationResult(null);
            }}
            spellCheck={false}
            className="flex-1 p-4 bg-[#070a14] font-mono text-[12px] text-[#e2e8f0] resize-none outline-none border-r border-[#1e2740] selection:bg-[#38bdf8]/30"
          />

          {/* Validation Feedback Panel */}
          <div className="w-72 bg-[#090d1a] p-4 flex flex-col overflow-y-auto space-y-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#8d9cc2]">Validation Report</span>

            {!validationResult ? (
              <div className="text-[#64748b] text-[12px]">
                Click "Validate Blueprint" or "Apply Blueprint" to test schema compliance and duration synchronization.
              </div>
            ) : (
              <div className="space-y-3">
                {validationResult.valid ? (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="font-bold">Valid Blueprint</div>
                      <div className="text-[11px] opacity-80">Ready to load into timeline.</div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 flex items-center gap-2">
                    <XCircle className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="font-bold">Errors Detected</div>
                      <div className="text-[11px] opacity-80">{validationResult.errors.length} issue(s) must be fixed.</div>
                    </div>
                  </div>
                )}

                {/* Error List */}
                {validationResult.errors.map((err, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[#270f14] border border-[#ef4444]/40 text-red-200 text-[11px] space-y-1">
                    <div className="font-bold flex items-center gap-1 text-red-400">
                      <XCircle className="w-3.5 h-3.5" /> {err.field}
                    </div>
                    <div>{err.message}</div>
                  </div>
                ))}

                {/* Warning List */}
                {validationResult.warnings.map((warn, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[#2a1e0b] border border-[#fbbf24]/40 text-amber-200 text-[11px] space-y-1">
                    <div className="font-bold flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" /> {warn.field}
                    </div>
                    <div>{warn.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1e2740] flex items-center justify-between bg-[#080c18]">
          <span className="text-[11px] text-[#8d9cc2]">
            Blueprints allow external AI directors to generate full video timelines deterministically.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#151b2e] border border-[#232d47] hover:border-slate-500 text-white font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#38bdf8] to-[#0ea5e9] text-[#051018] font-black shadow-lg shadow-[#38bdf8]/25 hover:brightness-110"
            >
              Apply to Studio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
