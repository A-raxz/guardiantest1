import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchQuiz, submitQuiz } from '../../api/endpoints';
import { AppButton, Card, EmptyState, ErrorView, LoadingView, ProgressBar, Row, Screen } from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** One question at a time, so the quiz reads well on a phone. */
export function QuizScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Quiz'>>();
  const navigation = useNavigation<Nav>();
  const { lessonId } = route.params;

  const { data, error, isLoading, reload } = useAsync(() => fetchQuiz(lessonId), [lessonId]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading && !data) return <LoadingView label="Loading quiz…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  if (!data.quiz.isReady) {
    return (
      <Screen>
        <EmptyState
          emoji="✍️"
          title="This quiz is still being written"
          body="Your HR Business Partner has not added the questions yet. Watching the video is enough for now."
        />
        <AppButton label="Back to the lesson" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const question = data.questions[index];
  const selected = answers[index] ?? null;
  const isLast = index === data.questions.length - 1;
  const allAnswered = data.questions.every((_, i) => answers[i] !== null && answers[i] !== undefined);

  const choose = (optionIndex: number) => {
    void Haptics.selectionAsync();
    setAnswers((previous) => {
      const next = [...previous];
      next[index] = optionIndex;
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitQuiz(
        data.quiz.id,
        data.questions.map((_, i) => answers[i] ?? -1),
      );
      void Haptics.notificationAsync(
        result.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
      navigation.replace('QuizResult', { result, lessonId });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not submit your answers');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>{data.quiz.title}</Text>
      <Row style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
        <Text style={styles.counter}>
          Question {index + 1} of {data.questions.length}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.counter}>Pass at {data.quiz.passScore}%</Text>
      </Row>
      <ProgressBar percent={((index + 1) / data.questions.length) * 100} height={6} />

      {data.previousBestScore !== null ? (
        <Text style={styles.previous}>
          Your best so far: {data.previousBestScore}%{data.alreadyPassed ? ' — already passed, XP is already banked.' : ''}
        </Text>
      ) : null}

      <Card style={{ marginTop: spacing.xl }}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        {question.options.map((option, optionIndex) => {
          const isSelected = selected === optionIndex;
          return (
            <Pressable
              key={`${question.id}-${optionIndex}`}
              onPress={() => choose(optionIndex)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              style={[styles.option, isSelected && styles.optionSelected]}
            >
              <View style={[styles.bullet, isSelected && styles.bulletSelected]}>
                <Text style={[styles.bulletText, isSelected && { color: colors.white }]}>
                  {String.fromCharCode(65 + optionIndex)}
                </Text>
              </View>
              <Text style={[styles.optionText, isSelected && { color: colors.text }]}>{option}</Text>
            </Pressable>
          );
        })}
      </Card>

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

      <Row style={{ marginTop: spacing.lg }}>
        {index > 0 ? (
          <AppButton label="Back" variant="secondary" onPress={() => setIndex(index - 1)} style={{ flex: 1 }} />
        ) : null}
        {isLast ? (
          <AppButton
            label="Submit answers"
            onPress={submit}
            disabled={!allAnswered}
            loading={submitting}
            style={{ flex: 2 }}
          />
        ) : (
          <AppButton
            label="Next"
            onPress={() => setIndex(index + 1)}
            disabled={selected === null}
            style={{ flex: 2 }}
          />
        )}
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.label, color: colors.primary },
  counter: { ...typography.caption },
  previous: { ...typography.caption, marginTop: spacing.md },
  prompt: { ...typography.heading, fontSize: 18, marginBottom: spacing.lg, lineHeight: 25 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  bullet: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  bulletSelected: { backgroundColor: colors.primary },
  bulletText: { ...typography.label, color: colors.textMuted },
  optionText: { ...typography.body, color: colors.textMuted, flex: 1 },
  error: { color: colors.danger, marginTop: spacing.md },
});
