package deploy

import (
	"bytes"
	"strings"
	"testing"
)

func TestComposeProgressKeepsTransitionsAndRepeatedDiagnostics(t *testing.T) {
	var output bytes.Buffer
	w := composeProgress{output: &output, states: map[string]string{}}
	for _, chunk := range []string{" Volume data Crea", "ting\n Volume data Creating\n Container web Creating\n Volume data Created\n Volume data Created\n", "warning: retry\nwarning: retry\n#1 RUN echo hi\n#1 RUN echo hi\n Container web Created\n Container web Starting\n Container web Started\n Container web Stopping\n Container web Starting\nlast"} {
		_, _ = w.Write([]byte(chunk))
	}
	w.Flush()
	got := output.String()
	if strings.Count(got, "Volume data Creating") != 1 || strings.Count(got, "Volume data Created") != 1 || strings.Count(got, "warning: retry") != 2 || strings.Count(got, "#1 RUN echo hi") != 2 || strings.Count(got, "Container web Starting") != 2 || !strings.HasSuffix(got, "last") {
		t.Fatal(got)
	}
}
