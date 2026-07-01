import React, { useRef } from 'react';
import { TextInput, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType    = 'default',
  autoCapitalize  = 'sentences',
  secureTextEntry = false,
  maxLength,
  prefix,          // e.g. "+91 " for phone input
  suffix,          // e.g. a clear button
  error,
  hint,
  autoFocus       = false,
  editable        = true,
  style,
  inputStyle,
  onSubmitEditing,
  returnKeyType   = 'done',
  multiline       = false,
  numberOfLines   = 1,
}) {
  const ref = useRef(null);

  return (
    <View style={[styles.wrapper, style]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View style={[
        styles.container,
        error && styles.containerError,
        !editable && styles.containerDisabled,
      ]}>
        {prefix && <View style={styles.prefix}><Text style={styles.prefixText}>{prefix}</Text></View>}

        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.multiline, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          autoFocus={autoFocus}
          editable={editable}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />

        {suffix && <TouchableOpacity style={styles.suffix}>{suffix}</TouchableOpacity>}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {hint  && !error && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:   { marginBottom: Spacing[4] },
  label:     { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text, marginBottom: Spacing[2] },

  container: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  Colors.surface,
    borderWidth:      1.5,
    borderColor:      Colors.border,
    borderRadius:     BorderRadius.lg,
    paddingHorizontal: Spacing[4],
    minHeight:        52,
  },
  containerError:    { borderColor: Colors.error },
  containerDisabled: { backgroundColor: Colors.surface2, opacity: 0.7 },

  input: {
    flex:            1,
    fontFamily:      Typography.fontFamily.regular,
    fontSize:        Typography.size.md,
    color:           Colors.text,
    paddingVertical: Spacing[3],
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },

  prefix:     { marginRight: Spacing[2] },
  prefixText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.md, color: Colors.textSecondary },
  suffix:     { marginLeft: Spacing[2] },

  error: { marginTop: Spacing[1], fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.error },
  hint:  { marginTop: Spacing[1], fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
});
