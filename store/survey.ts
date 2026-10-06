/**
 * Survey store — manages pending survey state for the client portal.
 * Handles fetching pending surveys, tracking answers, and offline-first submission.
 */

import { create } from 'zustand';
import * as api from '@/lib/data/api';
import type { PendingSurvey } from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';

interface AnswerMap {
  [questionId: number]: {
    response_value?: number | null;
    response_text?: string | null;
    response_options?: string[] | null;
  };
}

interface SurveyState {
  pendingSurvey: PendingSurvey | null;
  hasPending: boolean;
  loading: boolean;
  error: string | null;
  currentQuestionIndex: number;
  answers: AnswerMap;
  submitting: boolean;

  fetchPendingSurvey: () => Promise<void>;
  setAnswer: (questionId: number, answer: { response_value?: number | null; response_text?: string | null; response_options?: string[] | null }) => void;
  goToNextQuestion: () => void;
  goToPrevQuestion: () => void;
  goToQuestion: (index: number) => void;
  submitAll: () => Promise<{ success: boolean }>;
  dismissSurvey: () => void;
  reset: () => void;
}

export const useSurveyStore = create<SurveyState>((set, get) => ({
  pendingSurvey: null,
  hasPending: false,
  loading: false,
  error: null,
  currentQuestionIndex: 0,
  answers: {},
  submitting: false,

  fetchPendingSurvey: async () => {
    set({ loading: true, error: null });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        set({ loading: false });
        return;
      }
      const response = await api.apiGetPendingSurvey(auth.token);
      if (response.has_pending_survey && response.survey) {
        const survey = response.survey;
        const initialAnswers: AnswerMap = {};
        for (const q of survey.questions) {
          if (q.already_answered) {
            initialAnswers[q.id] = {
              response_value: q.user_answer_value ?? null,
              response_text: q.user_answer_text ?? null,
              response_options: q.user_answer_options ?? null,
            };
          }
        }
        set({
          pendingSurvey: survey,
          hasPending: true,
          loading: false,
          currentQuestionIndex: 0,
          answers: initialAnswers,
        });
      } else {
        set({ hasPending: false, pendingSurvey: null, loading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  setAnswer: (questionId, answer) => {
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer },
    }));
  },

  goToNextQuestion: () => {
    const { pendingSurvey, currentQuestionIndex } = get();
    if (pendingSurvey && currentQuestionIndex < pendingSurvey.questions.length - 1) {
      set({ currentQuestionIndex: currentQuestionIndex + 1 });
    }
  },

  goToPrevQuestion: () => {
    const { currentQuestionIndex } = get();
    if (currentQuestionIndex > 0) {
      set({ currentQuestionIndex: currentQuestionIndex - 1 });
    }
  },

  goToQuestion: (index) => {
    set({ currentQuestionIndex: index });
  },

  submitAll: async () => {
    const { pendingSurvey, answers } = get();
    if (!pendingSurvey) return { success: false };

    set({ submitting: true });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        set({ submitting: false, error: 'Not authenticated' });
        return { success: false };
      }

      const responses = pendingSurvey.questions.map((q) => ({
        question_id: q.id,
        response_value: answers[q.id]?.response_value ?? null,
        response_text: answers[q.id]?.response_text ?? null,
        response_options: answers[q.id]?.response_options ?? null,
      }));

      await api.apiSurveyBatchRespond(auth.token, {
        session_id: pendingSurvey.session_id,
        responses,
        complete_session: true,
      });

      set({ submitting: false, hasPending: false, pendingSurvey: null, answers: {}, currentQuestionIndex: 0 });
      return { success: true };
    } catch (err) {
      set({ submitting: false, error: (err as Error).message });
      return { success: false };
    }
  },

  dismissSurvey: () => {
    set({ hasPending: false, pendingSurvey: null, answers: {}, currentQuestionIndex: 0 });
  },

  reset: () => {
    set({
      pendingSurvey: null,
      hasPending: false,
      loading: false,
      error: null,
      currentQuestionIndex: 0,
      answers: {},
      submitting: false,
    });
  },
}));
