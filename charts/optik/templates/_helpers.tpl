{{- define "optik.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "optik.fullname" -}}
{{- if contains .Chart.Name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "optik.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{ include "optik.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "optik.selectorLabels" -}}
app.kubernetes.io/name: {{ include "optik.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "optik.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "optik.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "optik.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "optik.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Password of the bundled PostgreSQL: set in values, kept from a previous install,
or generated. Stored back into .Values so every template sees the same value.
*/}}
{{- define "optik.postgresql.password" -}}
{{- if not .Values.postgresql.password }}
{{- $existing := lookup "v1" "Secret" .Release.Namespace (include "optik.postgresql.fullname" .) }}
{{- if and $existing $existing.data (index $existing.data "POSTGRES_PASSWORD") }}
{{- $_ := set .Values.postgresql "password" (index $existing.data "POSTGRES_PASSWORD" | b64dec) }}
{{- else }}
{{- $_ := set .Values.postgresql "password" (randAlphaNum 32) }}
{{- end }}
{{- end }}
{{- .Values.postgresql.password }}
{{- end }}

{{/* Secret and key holding DATABASE_URL */}}
{{- define "optik.database.secretName" -}}
{{- if and (not .Values.postgresql.enabled) .Values.database.existingSecret }}
{{- .Values.database.existingSecret }}
{{- else }}
{{- include "optik.fullname" . }}
{{- end }}
{{- end }}

{{- define "optik.database.secretKey" -}}
{{- if and (not .Values.postgresql.enabled) .Values.database.existingSecret }}
{{- .Values.database.existingSecretKey }}
{{- else }}
{{- print "DATABASE_URL" }}
{{- end }}
{{- end }}

{{- define "optik.s3.secretName" -}}
{{- default (printf "%s-s3" (include "optik.fullname" .)) .Values.storage.s3.existingSecret }}
{{- end }}
