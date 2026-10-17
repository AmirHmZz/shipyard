//go:build linux

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"shipyard/internal/buildinfo"
	"shipyard/internal/installation"
	"shipyard/internal/platformupdate"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) == 3 && os.Args[1] == "upgrade" {
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
		defer stop()
		return platformupdate.RunUpgrade(ctx, os.Args[2])
	}
	if len(os.Args) == 2 && os.Args[1] == "version" {
		return json.NewEncoder(os.Stdout).Encode(buildinfo.Current())
	}
	if len(os.Args) >= 2 && os.Args[1] == "install-finish" {
		return installation.Finish()
	}
	if len(os.Args) == 7 && os.Args[1] == "install" {
		return installation.Init(os.Args[2], os.Args[3], os.Args[4], os.Args[5], os.Args[6] == "true")
	}
	if e := os.MkdirAll("/var/lib/shipyard", 0700); e != nil {
		return e
	}
	if e := os.Chmod("/var/lib/shipyard", 0700); e != nil {
		return e
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	if len(os.Args) == 4 && os.Args[1] == "run" {
		token := os.Args[2]
		if len(token) != 36 || strings.Trim(token, "0123456789abcdef-") != "" {
			return fmt.Errorf("invalid command token")
		}
		dir := "/var/lib/shipyard/exec"
		if e := os.MkdirAll(dir, 0700); e != nil {
			return e
		}
		pid := filepath.Join(dir, token)
		cmd := exec.Command("sh", "-c", os.Args[3])
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if e := cmd.Start(); e != nil {
			return e
		}
		defer os.Remove(pid)
		if e := os.WriteFile(pid, []byte(strconv.Itoa(cmd.Process.Pid)), 0600); e != nil {
			syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			cmd.Wait()
			return e
		}
		done := make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			case <-done:
			}
		}()
		e := cmd.Wait()
		close(done)
		return e
	}
	if len(os.Args) == 2 && os.Args[1] == "idle" {
		<-ctx.Done()
		return nil
	}
	if len(os.Args) != 4 || os.Args[1] != "dial" {
		return fmt.Errorf("usage: shipyard-executor idle | dial tcp|unix address")
	}
	network, address := os.Args[2], os.Args[3]
	if network != "tcp" && network != "unix" {
		return fmt.Errorf("unsupported network")
	}
	conn, e := (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, address)
	if e != nil {
		return e
	}
	defer conn.Close()
	fmt.Fprint(os.Stdout, "OK\n")
	done := make(chan struct{}, 1)
	go func() { io.Copy(conn, os.Stdin); conn.Close(); done <- struct{}{} }()
	io.Copy(os.Stdout, conn)
	return nil
}
