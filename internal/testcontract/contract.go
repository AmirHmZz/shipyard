// Package testcontract validates real handler responses against the embedded API contract.
package testcontract

import (
	"context"
	"net/http"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/legacy"
	contract "shipyard/api"
)

func Document(t testing.TB) *openapi3.T {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromData(contract.OpenAPI)
	if err != nil {
		t.Fatal(err)
	}
	if err = doc.Validate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return doc
}

func Response(t testing.TB, request *http.Request, response *http.Response, body []byte) {
	t.Helper()
	doc := Document(t)
	doc.Servers = openapi3.Servers{{URL: request.URL.Scheme + "://" + request.URL.Host + "/api/v1"}}
	router, err := legacy.NewRouter(doc)
	if err != nil {
		t.Fatalf("validator router: %v", err)
	}
	route, params, err := router.FindRoute(request)
	if err != nil {
		t.Fatalf("match %s %s: %v", request.Method, request.URL, err)
	}
	input := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{Request: request, Route: route, PathParams: params},
		Status:                 response.StatusCode, Header: response.Header,
		Options: &openapi3filter.Options{IncludeResponseStatus: true},
	}
	if err = openapi3filter.ValidateResponse(context.Background(), input.SetBodyBytes(body)); err != nil {
		t.Fatalf("%s %s: %v", request.Method, request.URL.Path, err)
	}
}
