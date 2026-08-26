"use client";

/**
 * 核心埋点（PRD §8）。
 * 只发送事件名与轻量属性（mode/topicSetKey/时长等），
 * 绝不发送完整转写、音频、推荐回答或个人识别信息。
 */

export type TrackEventName =
  | "practice_mode_selected"
  | "personal_background_category_selected"
  | "standard_topic_selected"
  | "practice_started"
  | "question_shown"
  | "recording_started"
  | "recording_ended"
  | "transcript_confirmed"
  | "response_feedback_ready"
  | "feedback_unavailable"
  | "question_completed"
  | "session_completed"
  | "history_opened"
  | "repractice_started"
  | "diagnostic_started"
  | "diagnostic_completed"
  | "stage_target_changed"
  | "record_deleted";

export function track(event: TrackEventName, props?: Record<string, unknown>) {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: event, props: props ?? {} }),
      keepalive: true,
    }).catch(() => {
      /* 埋点失败不影响功能 */
    });
  } catch {
    /* 忽略 */
  }
}
