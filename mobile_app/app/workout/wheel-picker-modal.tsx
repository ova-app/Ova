import React, { useEffect, useMemo, useRef } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget, spring } from '@/constants/theme'

// ─── Types ────────────────────────────────────────────────────────────────

interface WheelPickerModalProps {
  isVisible: boolean
  onClose: () => void
  onValidate: (weight: number, reps: number) => void
  currentWeight?: number
  currentReps?: number
  equipmentType: string | null
  ghostValue?: number
  ghostBeaten?: boolean
}

interface WheelState {
  weight: number
  reps: number
}

// ─── Constants ────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 80
const VISIBLE_ITEMS = 3
const CENTER_ITEM_INDEX = Math.floor(VISIBLE_ITEMS / 2)

const REPS_VALUES = Array.from({ length: 50 }, (_, i) => i + 1)

function getWeightValues(equipType: string | null): number[] {
  if (equipType === 'bodyweight') return []
  if (equipType === 'dumbbell') return Array.from({ length: 30 }, (_, i) => (i + 1) * 2)
  if (equipType === 'barbell') {
    return [20, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220]
  }
  if (equipType === 'kettlebell') return Array.from({ length: 12 }, (_, i) => (i + 1) * 4)
  return Array.from({ length: 80 }, (_, i) => (i + 1) * 2.5)
}

// ─── Wheel Picker Component (single wheel) ─────────────────────────────────

interface SingleWheelProps {
  values: number[]
  selectedValue: number
  onValueChange: (val: number) => void
  label: string
  isEmpty?: boolean
}

const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS // 240px, hauteur fixe de la zone scroll

function SingleWheel({ values, selectedValue, onValueChange, label, isEmpty }: SingleWheelProps) {
  const { colors } = useTheme()
  const scrollRef = useRef<FlatList<number>>(null)
  const selectedIndex = values.indexOf(selectedValue)
  const currentIndex = selectedIndex === -1 ? 0 : selectedIndex

  useEffect(() => {
    if (scrollRef.current && values.length > 0) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollToOffset({
          offset: currentIndex * ITEM_HEIGHT,
          animated: false,
        })
      }, 80)
      return () => clearTimeout(t)
    }
  // currentIndex exclu intentionnellement : ne jamais interrompre un scroll utilisateur en cours
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.length])

  function handleMomentumScrollEnd(e: { nativeEvent: { contentOffset: { y: number } } }) {
    if (values.length === 0) return
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(idx, values.length - 1))
    onValueChange(values[clamped])
  }

  if (isEmpty || values.length === 0) {
    return (
      <View style={styles.wheelContainer}>
        <View style={[styles.wheelScroll, { height: WHEEL_HEIGHT, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.wheelEmptyText, { color: colors.textTertiary }]}>—</Text>
        </View>
        <View style={[styles.wheelCenterHighlight, { top: ITEM_HEIGHT * CENTER_ITEM_INDEX }]} pointerEvents="none">
          <View style={styles.wheelCenterBox} />
        </View>
        <Text style={[styles.wheelLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    )
  }

  return (
    <View style={styles.wheelContainer}>
      {/* FlatList wheel */}
      <FlatList
        ref={scrollRef}
        data={values}
        style={styles.wheelScroll}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * CENTER_ITEM_INDEX + ITEM_HEIGHT * index,
          index,
        })}
        renderItem={({ item: val, index: idx }) => {
          const distFromCenter = Math.abs(idx - currentIndex)
          const isSelected = distFromCenter === 0
          const fontSize = isSelected ? 56 : distFromCenter === 1 ? 36 : 20
          const opacity = isSelected ? 1 : distFromCenter === 1 ? 0.5 : 0.2
          const fontFamily = isSelected ? 'Barlow_900Black' : 'Barlow_500Medium'
          const letterSpacing = isSelected ? -1.5 : 0
          return (
            <View style={[styles.wheelItem, { height: ITEM_HEIGHT }]}>
              <Text
                style={{
                  fontSize,
                  fontFamily,
                  color: colors.textPrimary,
                  opacity,
                  fontVariant: ['tabular-nums'],
                  letterSpacing,
                }}
              >
                {val}
              </Text>
            </View>
          )
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * CENTER_ITEM_INDEX }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      />

      {/* Center highlight — au-dessus de la liste, transparent avec bordures uniquement */}
      <View style={[styles.wheelCenterHighlight, { top: ITEM_HEIGHT * CENTER_ITEM_INDEX }]} pointerEvents="none">
        <View style={styles.wheelCenterBox} />
      </View>

      {/* Label at bottom */}
      <Text style={[styles.wheelLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

// ─── Main Modal ────────────────────────────────────────────────────────────

export default function WheelPickerModal({
  isVisible,
  onClose,
  onValidate,
  currentWeight = 20,
  currentReps = 5,
  equipmentType,
  ghostValue,
  ghostBeaten = false,
}: WheelPickerModalProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const slideValue = useSharedValue(Dimensions.get('window').height)
  const backdropOpacity = useSharedValue(0)
  const [mounted, setMounted] = React.useState(isVisible)

  const [state, setState] = React.useState<WheelState>({
    weight: currentWeight,
    reps: currentReps,
  })

  const weightValues = useMemo(() => getWeightValues(equipmentType), [equipmentType])

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideValue.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  useEffect(() => {
    if (isVisible) {
      setMounted(true)
      slideValue.value = withTiming(0, { duration: 320, easing: Easing.bezier(0.16, 1, 0.3, 1) })
      backdropOpacity.value = withTiming(1, { duration: 200 })
    } else {
      slideValue.value = withSpring(Dimensions.get('window').height, spring.snappy)
      backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) })
      const t = setTimeout(() => setMounted(false), 360)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible])

  function handleValidate() {
    onValidate(state.weight, state.reps)
    onClose()
  }

  if (!mounted) return null

  // Current ghost status: weight beats ghost
  const ghostBeatenCurrent = ghostBeaten && state.weight > (ghostValue ?? 0)

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Overlay backdrop — animé */}
      <Animated.View
        style={[styles.modalOverlay, backdropStyle]}
        pointerEvents={isVisible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Modal sheet (80% height) */}
      <Animated.View
        style={[
          styles.modalSheet,
          { backgroundColor: colors.backgroundSecondary },
          slideStyle,
        ]}
      >
        {/* Handle & header */}
        <View style={styles.modalTopBar}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.modalHeaderFlex}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Ajouter un set
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3 wheels container */}
        <View style={styles.wheelsContainer}>
          {weightValues.length > 0 ? (
            <SingleWheel
              values={weightValues}
              selectedValue={state.weight}
              onValueChange={(w) => setState(s => ({ ...s, weight: w }))}
              label="KG"
            />
          ) : (
            <SingleWheel
              values={[]}
              selectedValue={0}
              onValueChange={() => {}}
              label="KG"
              isEmpty
            />
          )}
          <SingleWheel
            values={REPS_VALUES}
            selectedValue={state.reps}
            onValueChange={(r) => setState(s => ({ ...s, reps: r }))}
            label="REPS"
          />
        </View>

        {/* Ghost badge (if weight picker) */}
        {ghostValue !== undefined && weightValues.length > 0 && (
          <View style={styles.ghostSection}>
            <View
              style={[
                styles.ghostBadge,
                {
                  backgroundColor: ghostBeatenCurrent
                    ? colors.accent
                    : colors.backgroundTertiary,
                },
              ]}
            >
              <Text
                style={[
                  styles.ghostBadgeText,
                  {
                    color: ghostBeatenCurrent ? colors.background : colors.textSecondary,
                  },
                ]}
              >
                {ghostBeatenCurrent
                  ? `↑ BATTU · +${(state.weight - ghostValue).toFixed(1)} kg`
                  : `↑ ${ghostValue.toFixed(1)} kg`}
              </Text>
            </View>
          </View>
        )}

        {/* Bottom buttons */}
        <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, spacing.s4) }]}>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: colors.border }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              ANNULER
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.validateButton, { backgroundColor: colors.accent }]}
            onPress={handleValidate}
            activeOpacity={0.85}
          >
            <Text style={[styles.validateText, { color: colors.background }]}>
              VALIDER
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Overlay ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  // ── Modal sheet ──
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '80%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    flexDirection: 'column',
  },

  // ── Top bar (handle + close) ──
  modalTopBar: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s2,
    alignItems: 'center',
    gap: spacing.s3,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
  },
  modalHeaderFlex: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    ...typography.title,
  },

  // ── Wheels container ──
  wheelsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s4,
  },

  // ── Single wheel ──
  wheelContainer: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.s2,
  },
  wheelScroll: {
    height: WHEEL_HEIGHT,
    width: '100%',
  },
  wheelCenterHighlight: {
    position: 'absolute',
    left: spacing.s2,
    right: spacing.s2,
    height: ITEM_HEIGHT,
    pointerEvents: 'none',
  },
  wheelCenterBox: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  wheelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelEmptyText: {
    ...typography.display,
  },
  wheelLabel: {
    ...typography.caption,
    letterSpacing: 1.2,
  },

  // ── Ghost badge ──
  ghostSection: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
    alignItems: 'center',
  },
  ghostBadge: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: radius.full,
  },
  ghostBadgeText: {
    ...typography.caption,
    letterSpacing: 0.3,
    fontSize: 11,
  },

  // ── Footer buttons ──
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  cancelButton: {
    flex: 1,
    height: touchTarget.comfort,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelText: {
    ...typography.subtitle,
    letterSpacing: 1,
  },
  validateButton: {
    flex: 1,
    height: touchTarget.comfort,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validateText: {
    ...typography.subtitle,
    letterSpacing: 1,
  },
})
