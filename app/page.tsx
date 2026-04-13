"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import HTMLFlipBook from "react-pageflip";

type PdfJsModule = typeof import("pdfjs-dist");
type FlipBookProps = Omit<React.ComponentProps<typeof HTMLFlipBook>, "children">;

type FlipPdfViewerProps = {
  fileUrl: string;
  fileName: string;
};

const LARGE_PDF_PAGE_THRESHOLD = 30;
const VERY_LARGE_PDF_PAGE_THRESHOLD = 80;
const RENDER_YIELD_MS = 0;

function isPdfFile(file: File): boolean {
  const hasPdfMimeType = file.type === "application/pdf";
  const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
  return hasPdfMimeType || hasPdfExtension;
}

function FlipPdfViewer({ fileUrl, fileName }: FlipPdfViewerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>("");

  useEffect(() => {
    if (!fileUrl) {
      setPages([]);
      setErrorMessage(null);
      setIsLoading(false);
      setLoadingStatus("");
      return;
    }

    let isCancelled = false;

    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        setPages([]);
        setLoadingStatus("PDFを解析しています…");

        const pdfjs: PdfJsModule = await import("pdfjs-dist");
        const workerVersion = pdfjs.version;
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjs.getDocument({ url: fileUrl });
        const pdf = await loadingTask.promise;
        const rendered: string[] = [];

        let scale = 1.3;
        if (pdf.numPages > LARGE_PDF_PAGE_THRESHOLD) {
          scale = 1.05;
        }
        if (pdf.numPages > VERY_LARGE_PDF_PAGE_THRESHOLD) {
          scale = 0.9;
        }

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          if (isCancelled) {
            return;
          }

          setLoadingStatus(`${pageNum} / ${pdf.numPages} ページを読み込み中…`);

          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Canvas context could not be created.");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({
            canvasContext: context,
            canvas,
            viewport,
          }).promise;

          rendered.push(canvas.toDataURL("image/jpeg", 0.85));

          if (!isCancelled) {
            setPages([...rendered]);
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), RENDER_YIELD_MS);
          });
        }

        if (!isCancelled) {
          setLoadingStatus("");
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : "PDFの読み込みに失敗しました。";
          setErrorMessage(message);
          setLoadingStatus("");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [fileUrl]);

  const flipBookProps: FlipBookProps = useMemo(
    () => ({
      width: 420,
      height: 600,
      showCover: true,
      mobileScrollSupport: false,
      className: "mx-auto",
      style: {},
      startPage: 0,
      size: "fixed",
      minWidth: 315,
      maxWidth: 1000,
      minHeight: 450,
      maxHeight: 1536,
      drawShadow: true,
      flippingTime: 700,
      usePortrait: true,
      startZIndex: 0,
      autoSize: false,
      maxShadowOpacity: 0.5,
      showPageCorners: true,
      disableFlipByClick: false,
      clickEventForward: true,
      useMouseEvents: true,
      swipeDistance: 30,
    }),
    []
  );

  if (isLoading && pages.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-300 bg-white p-6 text-center shadow-sm">
        <p>PDFを読み込み中です…</p>
        {loadingStatus ? <p className="mt-2 text-sm text-neutral-500">{loadingStatus}</p> : null}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        <p className="font-semibold">PDFを表示できませんでした。</p>
        <p className="mt-2 break-all">{errorMessage}</p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500 shadow-sm">
        PDFを選択すると、ここに本のような表示でプレビューします。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isLoading && loadingStatus ? (
        <div className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">
          {loadingStatus}
        </div>
      ) : null}

      <div className="rounded-2xl bg-neutral-200 p-4 shadow-inner">
        <HTMLFlipBook {...flipBookProps}>
          {pages.map((src, index) => (
            <div key={`${fileName}-${index}`} className="relative h-full w-full overflow-hidden bg-white">
              <Image
                src={src}
                alt={`${fileName} ${index + 1}ページ目`}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 420px"
                className="object-contain"
              />
            </div>
          ))}
        </HTMLFlipBook>
      </div>
    </div>
  );
}

export default function Page() {
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [selectedFileUrl, setSelectedFileUrl] = useState<string>("");
  const [fileValidationMessage, setFileValidationMessage] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!isPdfFile(file)) {
      setFileValidationMessage("PDFファイルのみアップロードできます。拡張子 .pdf のファイルを選択してください。");
      setSelectedFileName("");
      setSelectedFileUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        return "";
      });
      input.value = "";
      return;
    }

    setFileValidationMessage(null);

    const objectUrl = URL.createObjectURL(file);
    setSelectedFileName(file.name);
    setSelectedFileUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return objectUrl;
    });
  };

  useEffect(() => {
    return () => {
      if (selectedFileUrl) {
        URL.revokeObjectURL(selectedFileUrl);
      }
    };
  }, [selectedFileUrl]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-neutral-900">PDFブックビューア</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          PDFをアップロードすると、各ページを画像化して本のようにめくれる表示で確認できます。
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <label htmlFor="pdf-upload" className="text-sm font-medium text-neutral-700">
            PDFファイルを選択
          </label>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700"
          />
          {selectedFileName ? (
            <p className="text-sm text-neutral-500">選択中: {selectedFileName}</p>
          ) : (
            <p className="text-sm text-neutral-400">まだPDFは選択されていません。</p>
          )}
          {fileValidationMessage ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fileValidationMessage}
            </p>
          ) : null}
          <p className="text-xs text-neutral-400">対応形式: PDF</p>
        </div>
      </section>

      <section>
        <FlipPdfViewer fileUrl={selectedFileUrl} fileName={selectedFileName || "PDF"} />
      </section>
    </main>
  );
}