/**
 * Shared form & validation layer (§12.2: React Hook Form + Zod).
 *
 * Schemas come from @paket/domain-types (single source of truth), so the same
 * Zod object that validates an API payload also drives the form. Field
 * components are MUI-based and surface validation errors inline.
 */
import type { JSX, ReactNode } from 'react';
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType, TypeOf } from 'zod';
import MuiTextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

/** Build a typed RHF form from a domain Zod schema. */
export function useZodForm<TSchema extends ZodType>(
  schema: TSchema,
  options?: Omit<UseFormProps<TypeOf<TSchema>>, 'resolver'>,
): UseFormReturn<TypeOf<TSchema>> {
  return useForm<TypeOf<TSchema>>({
    // resolver bridges Zod issues into RHF field errors.
    resolver: zodResolver(schema) as UseFormProps<TypeOf<TSchema>>['resolver'],
    mode: 'onTouched',
    ...options,
  });
}

export interface ZodFormProps<TSchema extends ZodType> {
  schema: TSchema;
  defaultValues?: DefaultValues<TypeOf<TSchema>>;
  onValidSubmit: (values: TypeOf<TSchema>) => void | Promise<void>;
  children: ReactNode;
}

/** Form wrapper that wires a schema, validation and a typed submit handler. */
export function ZodForm<TSchema extends ZodType>({
  schema,
  defaultValues,
  onValidSubmit,
  children,
}: ZodFormProps<TSchema>): JSX.Element {
  const methods = useZodForm(schema, { defaultValues });
  return (
    <FormProvider {...methods}>
      <form noValidate onSubmit={methods.handleSubmit(onValidSubmit)}>
        {children}
      </form>
    </FormProvider>
  );
}

interface FieldBaseProps {
  name: string;
  label: string;
  required?: boolean;
  helperText?: string;
}

/** Text input bound to the surrounding ZodForm context. */
export function RHFTextField({ name, label, required, helperText }: FieldBaseProps): JSX.Element {
  const { control } = useFormContext<FieldValues>();
  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      render={({ field, fieldState }) => (
        <MuiTextField
          {...field}
          value={field.value ?? ''}
          label={label}
          required={required}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          margin="normal"
        />
      )}
    />
  );
}

/** Numeric input that coerces to `number` for Zod number schemas. */
export function RHFNumberField({ name, label, required, helperText }: FieldBaseProps): JSX.Element {
  const { control } = useFormContext<FieldValues>();
  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      render={({ field, fieldState }) => (
        <MuiTextField
          {...field}
          type="number"
          value={field.value ?? ''}
          onChange={(e) =>
            field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          label={label}
          required={required}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          margin="normal"
        />
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface RHFSelectFieldProps extends FieldBaseProps {
  options: readonly SelectOption[];
}

/** Single-select bound to the ZodForm context (e.g. enum fields). */
export function RHFSelectField({
  name,
  label,
  required,
  helperText,
  options,
}: RHFSelectFieldProps): JSX.Element {
  const { control } = useFormContext<FieldValues>();
  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      render={({ field, fieldState }) => (
        <MuiTextField
          {...field}
          select
          value={field.value ?? ''}
          label={label}
          required={required}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          margin="normal"
        >
          {options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </MuiTextField>
      )}
    />
  );
}
