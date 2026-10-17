// This server exists only for isolated Linux protocol/deployment integration tests.
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"github.com/coder/websocket"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "read-state" {
		b, err := os.ReadFile("/inspect/marker")
		if err != nil {
			panic(err)
		}
		fmt.Print(string(b))
		return
	}
	if path := os.Getenv("STATE_DIR"); path != "" {
		_ = os.MkdirAll(path, 0700)
		file := filepath.Join(path, "marker")
		if _, e := os.Stat(file); os.IsNotExist(e) {
			_ = os.WriteFile(file, []byte(os.Getenv("VERSION")), 0600)
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/fail", func(w http.ResponseWriter, r *http.Request) { http.Error(w, "unhealthy", 500) })
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, e := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if e != nil {
			return
		}
		defer conn.CloseNow()
		for {
			kind, b, e := conn.Read(r.Context())
			if e != nil {
				return
			}
			if conn.Write(r.Context(), kind, b) != nil {
				return
			}
		}
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		var state []byte
		if path := os.Getenv("STATE_DIR"); path != "" {
			state, _ = os.ReadFile(filepath.Join(path, "marker"))
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"version": os.Getenv("VERSION"), "path": r.URL.Path, "state": string(state)})
	})
	go http.ListenAndServe(":8080", mux)
	rpc := grpc.NewServer()
	h := health.NewServer()
	h.SetServingStatus("fixture", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(rpc, h)
	listener, _ := net.Listen("tcp", ":9090")
	go rpc.Serve(listener)
	go func() {
		for {
			time.Sleep(time.Second)
			h.SetServingStatus("fixture", healthpb.HealthCheckResponse_NOT_SERVING)
			time.Sleep(time.Second)
			h.SetServingStatus("fixture", healthpb.HealthCheckResponse_SERVING)
		}
	}()
	plain, _ := net.Listen("tcp", ":7000")
	go echo(plain)
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "tcp.example.com"}, DNSNames: []string{"tcp.example.com"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, _ := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	cert, _ := tls.X509KeyPair(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	encrypted, _ := tls.Listen("tcp", ":7001", &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12})
	go echo(encrypted)
	<-context.Background().Done()
}
func echo(listener net.Listener) {
	for {
		conn, e := listener.Accept()
		if e != nil {
			return
		}
		go func() {
			defer conn.Close()
			line, e := bufio.NewReader(conn).ReadBytes('\n')
			if e == nil {
				_, _ = io.WriteString(conn, "echo:"+string(line))
			}
		}()
	}
}
