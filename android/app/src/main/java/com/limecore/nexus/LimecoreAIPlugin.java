package com.limecore.nexus;

// v1.4 — On-device generative AI via the ML Kit GenAI Prompt API (Gemini Nano
// through AICore). Powers NCC's cross-domain "Life narrative". All inference is
// on-device — no prompt or data leaves the phone.
//
// API: com.google.mlkit:genai-prompt. We use the Java Futures wrapper
// (GenerativeModelFutures) to match this project's all-Java plugin convention.
//
// JS interface (see src/plugins/limecoreAI.ts):
//   isAvailable() -> { available: boolean, status: number, reason: string }
//   generateText({ prompt, maxTokens?, temperature? }) -> { text: string }
//
// Feature status (checkStatus): AVAILABLE = ready; DOWNLOADABLE = supported but
// the model isn't on the device yet (we kick a background download); DOWNLOADING
// = in progress; UNAVAILABLE = device doesn't support it. The whole feature
// degrades to null in JS when not AVAILABLE, so callers never hard-depend on it.

import android.util.Log;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;

import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.Candidate;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.GenerationConfig;
import com.google.mlkit.genai.prompt.GenerativeModel;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

import java.util.List;

@CapacitorPlugin(name = "LimecoreAI")
public class LimecoreAIPlugin extends Plugin {

    private static final String TAG = "LimecoreAI";

    private GenerativeModelFutures model;
    // Guards against firing multiple concurrent model downloads.
    private volatile boolean downloadInFlight = false;

    private synchronized GenerativeModelFutures getModel() {
        if (model == null) {
            GenerationConfig config = new GenerationConfig.Builder().build();
            GenerativeModel gm = Generation.INSTANCE.getClient(config);
            model = GenerativeModelFutures.from(gm);
        }
        return model;
    }

    @Override
    public void load() {
        // Probe on plugin init: log the on-device feature status to logcat so we
        // can confirm device capability without a JS round-trip, and warm up the
        // client. Best-effort — any failure just logs.
        try {
            Futures.addCallback(getModel().checkStatus(), new FutureCallback<Integer>() {
                @Override public void onSuccess(Integer status) {
                    Log.i(TAG, "checkStatus -> " + status + " (" + statusName(status) + ")");
                }
                @Override public void onFailure(@NonNull Throwable t) {
                    Log.w(TAG, "checkStatus failed", t);
                }
            }, MoreExecutors.directExecutor());
        } catch (Throwable t) {
            Log.w(TAG, "probe init failed", t);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            Futures.addCallback(getModel().checkStatus(), new FutureCallback<Integer>() {
                @Override public void onSuccess(Integer status) {
                    boolean available = status != null && status == FeatureStatus.AVAILABLE;
                    // Downloadable = supported but not yet on-device. Kick a
                    // background download so a later call finds it ready.
                    if (status != null && status == FeatureStatus.DOWNLOADABLE) {
                        triggerDownload();
                    }
                    JSObject r = new JSObject();
                    r.put("available", available);
                    r.put("status", status == null ? -1 : status);
                    r.put("reason", statusName(status));
                    call.resolve(r);
                }
                @Override public void onFailure(@NonNull Throwable t) {
                    resolveUnavailable(call, t.getMessage());
                }
            }, MoreExecutors.directExecutor());
        } catch (Throwable t) {
            resolveUnavailable(call, t.getMessage());
        }
    }

    @PluginMethod
    public void generateText(PluginCall call) {
        final String prompt = call.getString("prompt");
        if (prompt == null || prompt.isEmpty()) {
            call.reject("prompt is required");
            return;
        }
        final Float temperature = call.getFloat("temperature", 0.6f);
        final Integer maxTokens = call.getInt("maxTokens", 256);

        try {
            final GenerativeModelFutures m = getModel();
            Futures.addCallback(m.checkStatus(), new FutureCallback<Integer>() {
                @Override public void onSuccess(Integer status) {
                    if (status == null || status != FeatureStatus.AVAILABLE) {
                        if (status != null && status == FeatureStatus.DOWNLOADABLE) {
                            triggerDownload();
                        }
                        call.reject("model not available: " + statusName(status));
                        return;
                    }
                    runGeneration(m, prompt, temperature, maxTokens, call);
                }
                @Override public void onFailure(@NonNull Throwable t) {
                    call.reject("status check failed: " + t.getMessage());
                }
            }, MoreExecutors.directExecutor());
        } catch (Throwable t) {
            call.reject("generateText failed: " + t.getMessage());
        }
    }

    private void runGeneration(GenerativeModelFutures m, String prompt, Float temperature,
                               Integer maxTokens, PluginCall call) {
        try {
            // The request-builder setters return void (not chainable) — call
            // them as statements, matching the ML Kit sample.
            GenerateContentRequest.Builder builder =
                new GenerateContentRequest.Builder(new TextPart(prompt));
            builder.setTemperature(temperature);
            builder.setMaxOutputTokens(maxTokens);
            GenerateContentRequest request = builder.build();
            Futures.addCallback(m.generateContent(request),
                new FutureCallback<GenerateContentResponse>() {
                    @Override public void onSuccess(GenerateContentResponse response) {
                        String text = null;
                        List<Candidate> candidates = response.getCandidates();
                        if (candidates != null && !candidates.isEmpty()) {
                            text = candidates.get(0).getText();
                        }
                        if (text == null || text.isEmpty()) {
                            call.reject("empty response");
                            return;
                        }
                        JSObject r = new JSObject();
                        r.put("text", text);
                        call.resolve(r);
                    }
                    @Override public void onFailure(@NonNull Throwable t) {
                        call.reject("inference failed: " + t.getMessage());
                    }
                }, MoreExecutors.directExecutor());
        } catch (Throwable t) {
            call.reject("inference setup failed: " + t.getMessage());
        }
    }

    private void triggerDownload() {
        if (downloadInFlight) return;
        downloadInFlight = true;
        try {
            getModel().download(new DownloadCallback() {
                @Override public void onDownloadStarted(long bytesToDownload) {
                    Log.i(TAG, "model download started: " + bytesToDownload + " bytes");
                }
                @Override public void onDownloadProgress(long totalBytesDownloaded) { }
                @Override public void onDownloadCompleted() {
                    downloadInFlight = false;
                    Log.i(TAG, "model download completed");
                }
                @Override public void onDownloadFailed(@NonNull GenAiException e) {
                    downloadInFlight = false;
                    Log.w(TAG, "model download failed", e);
                }
            });
        } catch (Throwable t) {
            downloadInFlight = false;
            Log.w(TAG, "triggerDownload failed", t);
        }
    }

    private void resolveUnavailable(PluginCall call, String reason) {
        JSObject r = new JSObject();
        r.put("available", false);
        r.put("status", -1);
        r.put("reason", reason);
        call.resolve(r);
    }

    private static String statusName(Integer status) {
        if (status == null) return "null";
        if (status == FeatureStatus.AVAILABLE) return "AVAILABLE";
        if (status == FeatureStatus.DOWNLOADABLE) return "DOWNLOADABLE";
        if (status == FeatureStatus.DOWNLOADING) return "DOWNLOADING";
        if (status == FeatureStatus.UNAVAILABLE) return "UNAVAILABLE";
        return "UNKNOWN(" + status + ")";
    }
}
