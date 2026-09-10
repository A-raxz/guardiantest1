import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchLessonQuiz, saveLessonQuiz } from '../../api/endpoints';
import type { QuizBuilderQuestion } from '../../api/types';
import { AppButton, Card, ErrorView, Field, LoadingView, Row, Screen, SectionHeader } from '../../components';
import { showDialog } from '../../components/dialog';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const blankQuestion = (): QuizBuilderQuestion => ({
  prompt: '',
  options: ['', ''],
  correctIndex: 0,
  explanation: '',
});

/** Write or edit the quiz that follows a video. */
export function QuizBuilderScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'QuizBuilder'>>();
  const navigation = useNavigation<Nav>();
  const { lessonId, lessonTitle } = route.params;

  const [questions, setQuestions] = useState<QuizBuilderQuestion[]>([]);
  const [passScore, setPassScore] = useState('70');
  const [xpReward, setXpReward] = useState('100');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchLessonQuiz(lessonId);
        if (cancelled) return;
        if (response.quiz) {
          setPassScore(String(response.quiz.passScore));
          setXpReward(String(response.quiz.xpReward));
          setQuestions(
            response.quiz.questions.length
              ? response.quiz.questions.map((question) => ({
                  prompt: question.prompt,
                  options: question.options,
                  correctIndex: question.correctIndex,
                  explanation: question.explanation ?? '',
                }))
              : [blankQuestion()],
          );
        } else {
          setQuestions([blankQuestion()]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this quiz');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const update = (index: number, patch: Partial<QuizBuilderQuestion>) =>
    setQuestions((previous) => previous.map((question, i) => (i === index ? { ...question, ...patch } : question)));

  const updateOption = (questionIndex: number, optionIndex: number, value: string) =>
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === questionIndex
          ? { ...question, options: question.options.map((option, j) => (j === optionIndex ? value : option)) }
          : question,
      ),
    );

  const save = async () => {
    const cleaned = questions
      .map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        options: question.options.map((option) => option.trim()).filter(Boolean),
        explanation: question.explanation?.trim() || null,
      }))
      .filter((question) => question.prompt && question.options.length >= 2);

    if (!cleaned.length) {
      showDialog('Nothing to save', 'Add at least one question with two answer options.');
      return;
    }
    const invalid = cleaned.find((question) => question.correctIndex >= question.options.length);
    if (invalid) {
      showDialog('Check the correct answer', `"${invalid.prompt}" points at an option that is now empty.`);
      return;
    }

    setSaving(true);
    try {
      await saveLessonQuiz(lessonId, {
        passScore: Number(passScore) || 70,
        xpReward: Number(xpReward) || 100,
        questions: cleaned,
      });
      navigation.goBack();
    } catch (e) {
      showDialog('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingView />;
  if (error) return <ErrorView message={error} onRetry={() => navigation.goBack()} />;

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>Quiz for</Text>
      <Text style={styles.title}>{lessonTitle}</Text>

      <Row style={{ marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Field label="Pass mark (%)" value={passScore} onChangeText={setPassScore} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="XP reward" value={xpReward} onChangeText={setXpReward} keyboardType="number-pad" />
        </View>
      </Row>

      <SectionHeader title={`${questions.length} question${questions.length === 1 ? '' : 's'}`} />

      {questions.map((question, questionIndex) => (
        <Card key={questionIndex}>
          <Row style={{ marginBottom: spacing.sm }}>
            <Text style={styles.questionNumber}>Question {questionIndex + 1}</Text>
            <View style={{ flex: 1 }} />
            {questions.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setQuestions((previous) => previous.filter((_, i) => i !== questionIndex))}
              >
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            ) : null}
          </Row>

          <Field
            label="Prompt"
            value={question.prompt}
            onChangeText={(value) => update(questionIndex, { prompt: value })}
            placeholder="What should the rep be able to answer?"
            multiline
          />

          <Text style={styles.optionsLabel}>Options — tap the circle to mark the correct one</Text>
          {question.options.map((option, optionIndex) => (
            <Row key={optionIndex} style={{ marginBottom: spacing.sm }}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: question.correctIndex === optionIndex }}
                onPress={() => update(questionIndex, { correctIndex: optionIndex })}
                style={[styles.radio, question.correctIndex === optionIndex && styles.radioOn]}
              >
                {question.correctIndex === optionIndex ? <Text style={styles.radioMark}>✓</Text> : null}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Field
                  label=""
                  value={option}
                  onChangeText={(value) => updateOption(questionIndex, optionIndex, value)}
                  placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                  style={{ marginBottom: 0 }}
                />
              </View>
              {question.options.length > 2 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove option"
                  onPress={() =>
                    update(questionIndex, {
                      options: question.options.filter((_, i) => i !== optionIndex),
                      correctIndex: question.correctIndex >= optionIndex ? Math.max(0, question.correctIndex - 1) : question.correctIndex,
                    })
                  }
                >
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              ) : null}
            </Row>
          ))}

          {question.options.length < 6 ? (
            <AppButton
              label="Add option"
              variant="ghost"
              onPress={() => update(questionIndex, { options: [...question.options, ''] })}
            />
          ) : null}

          <Field
            label="Explanation (optional)"
            value={question.explanation ?? ''}
            onChangeText={(value) => update(questionIndex, { explanation: value })}
            placeholder="Shown to the rep when they get it wrong"
          />
        </Card>
      ))}

      <AppButton
        label="Add question"
        variant="secondary"
        onPress={() => setQuestions((previous) => [...previous, blankQuestion()])}
      />
      <AppButton label="Save quiz" onPress={() => void save()} loading={saving} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.label, color: colors.primary },
  title: { ...typography.title, marginTop: 2 },
  questionNumber: { ...typography.label, color: colors.text },
  remove: { ...typography.caption, color: colors.danger, paddingHorizontal: spacing.sm },
  optionsLabel: { ...typography.caption, marginBottom: spacing.sm },
  radio: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  radioOn: { backgroundColor: colors.success, borderColor: colors.success },
  radioMark: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
