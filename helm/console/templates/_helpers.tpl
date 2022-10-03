{{/*
Expand the name of the chart.
*/}}
{{- define "console.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "console.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "console.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "console.labels" -}}
helm.sh/chart: {{ include "console.chart" . }}
{{ include "console.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "console.selectorLabels" -}}
app.kubernetes.io/name: {{ include "console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "console.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "console.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Server Listen Port for Console's HTTP server.
The port can be overriden in the provided config, but
it defaults to 8080.
*/}}
{{- define "console.server.listenPort" -}}
{{- if .Values.console.config.server -}}
{{- .Values.console.config.server.listenPort | default 8080 }}
{{- else -}}
8080
{{- end }}
{{- end }}

{{/*
Some umbrella charts may use a global registry variable.
In order to be compatible with this, we will watch for a global.imageRegistry
variable or return the imageRegistry as specified via the values.
*/}}
{{- define "console.imageRegistry" -}}
{{- $registryName := .Values.image.registry -}}
{{- if .Values.global }}
    {{- if .Values.global.imageRegistry }}
        {{- printf "%s" .Values.global.imageRegistry -}}
    {{- else -}}
        {{- printf "%s" $registryName -}}
    {{- end -}}
{{- else -}}
    {{- printf "%s" $registryName -}}
{{- end -}}
{{- end -}}
