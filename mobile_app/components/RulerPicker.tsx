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
const PAD = PICKER_H / 2           // 110

// item i is centered when scrollY = ITEM_H/2 + i * ITEM_H
// (derived: paddingTop=110, item_center_in_content = 110 + i*44 + 22 = 132+i*44
//  visible_center = scrollY+110 → scrollY = 22 + i*44 = ITEM_H/2 + i*ITEM_H)

export default function RulerPicker({
  value, min, max, step, unit, onChange, colors,
}: RulerPickerProps) {
  const ref = useRef<ScrollView>(null)

  const items = useMemo(() => {
    const arr: number[] = []
    for (let v = min; v <= max; v = Math.round((v + step) * 100) / 100) {
      arr.push(v)
    }
    return arr
  }, [min, max, step])

  const indexOfValue = useCallback((v: number) => {
    const i = items.findIndex(item => Math.abs(item - v) < step / 2)
    return i === -1 ? 0 : i
  }, [items, step])

  useEffect(() => {
    const i = indexOfValue(value)
    ref.current?.scrollTo({ y: ITEM_H / 2 + i * ITEM_H, animated: false })
  }, [value, indexOfValue])

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y
    const i = Math.max(0, Math.min(
      Math.round((offsetY - ITEM_H / 2) / ITEM_H),
      items.length - 1
    ))
    const newVal = items[i]
    if (newVal !== undefined) {
      const snapY = ITEM_H / 2 + i * ITEM_H
      ref.current?.scrollTo({ y: snapY, animated: true })
      if (newVal !== value) onChange(newVal)
    }
  }, [items, onChange, value])

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        style={{ height: PICKER_H, flex: 1 }}
        contentContainerStyle={{ paddingVertical: PAD }}
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
  cursor: {
    position: 'absolute',
    left: spacing.s4,
    right: 104,
    top: PICKER_H / 2 - ITEM_H / 2,
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
