import React, { useRef, useEffect, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { spacing, typography, font, radius } from '@/constants/theme'
import type { ThemeColors } from '@/constants/theme'

interface RulerPickerProps {
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
  colors: ThemeColors
}

const ITEM_H = 44
const VISIBLE = 5
const PICKER_H = ITEM_H * VISIBLE  // 220

// With SNAP_PAD as paddingTop/Bottom:
//   item i center in content = SNAP_PAD + i*ITEM_H + ITEM_H/2
//   visible center at scrollY = scrollY + PICKER_H/2
//   centered when: scrollY = i * ITEM_H  (exact multiple → snapToInterval aligns)
const SNAP_PAD = PICKER_H / 2 - ITEM_H / 2  // 88

export default function RulerPicker({
  value, min, max, step, unit, onChange, colors,
}: RulerPickerProps) {
  const ref = useRef<ScrollView>(null)
  // prevent double-fire between onScrollEndDrag + onMomentumScrollEnd
  const handlingRef = useRef(false)

  const items = useMemo(() => {
    const arr: number[] = []
    for (let v = min; v <= max; v = Math.round((v + step) * 100) / 100) {
      arr.push(v)
    }
    return arr
  }, [min, max, step])

  const indexOfValue = useCallback((v: number): number => {
    const i = items.findIndex(item => Math.abs(item - v) < step / 2)
    return i === -1 ? 0 : i
  }, [items, step])

  // Scroll to initial position on mount only — avoids interrupting user mid-scroll
  useEffect(() => {
    const i = indexOfValue(value)
    // short delay ensures ScrollView is laid out before scrollTo
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: i * ITEM_H, animated: false })
    }, 50)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])  // items is stable — runs once after mount

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (handlingRef.current) return
    handlingRef.current = true
    setTimeout(() => { handlingRef.current = false }, 100)

    const offsetY = e.nativeEvent.contentOffset.y
    const i = Math.max(0, Math.min(Math.round(offsetY / ITEM_H), items.length - 1))
    const newVal = items[i]
    // NO scrollTo here — snapToInterval handles native snapping, scrollTo would loop
    if (newVal !== undefined && newVal !== value) onChange(newVal)
  }, [items, onChange, value])

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={64}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
      >
        {items.map((item) => (
          <View key={item} style={styles.item}>
            <Text style={[styles.itemText, { color: colors.textSecondary }]}>
              {item.toFixed(step < 1 ? 1 : 0)}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* selection highlight — absolutely positioned over the scroll area */}
      <View
        pointerEvents="none"
        style={[
          styles.cursor,
          { borderColor: colors.accent, backgroundColor: `${colors.accent}12` },
        ]}
      />

      <View style={styles.valueSide}>
        <Text style={[typography.display, styles.valueText, { color: colors.accent }]}>
          {value.toFixed(step < 1 ? 1 : 0)}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          {unit}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  scroll: {
    height: PICKER_H,
    flex: 1,
  },
  content: {
    paddingTop: SNAP_PAD,
    paddingBottom: SNAP_PAD,
  },
  item: {
    height: ITEM_H,
    justifyContent: 'center',
    paddingLeft: spacing.s5,
  },
  itemText: {
    fontSize: 15,
    fontFamily: font.regular,
    fontVariant: ['tabular-nums'],
  },
  // cursor sits at the visual center of the ScrollView
  cursor: {
    position: 'absolute',
    left: spacing.s4,
    right: 104,
    top: SNAP_PAD,  // = PICKER_H/2 - ITEM_H/2, center of visible area
    height: ITEM_H,
    borderWidth: 1.5,
    borderRadius: 8,
  },
  valueSide: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingRight: spacing.s4,
  },
  valueText: {
    fontFamily: font.extraBold,
    fontVariant: ['tabular-nums'],
  },
})
