package db

import (
	"context"
	"reflect"
	"sync"
	"testing"
)

func TestPresentationOrderingAndCleanup(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Pool.Exec(ctx, `INSERT INTO resources(id,kind,name,parent_id,data) VALUES
	('a','project','A','','{}'),('hidden','project','Hidden','','{}'),('b','project','B','','{}'),
	('app','application','App','env','{}'),('other','application','Other','env','{}'),('cross','application','Cross','env2','{}'),
	('preview','application','Preview','env','{"previewOf":"app"}')`); err != nil {
		t.Fatal(err)
	}
	order := func() []string {
		t.Helper()
		rows, err := s.Pool.Query(ctx, "SELECT id FROM resources WHERE kind='project' ORDER BY sort_order,created_at,id")
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			out = append(out, id)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		return out
	}
	a := "a"
	if err := s.MoveResource(ctx, "b", &a); err != nil {
		t.Fatal(err)
	}
	if got := order(); !reflect.DeepEqual(got, []string{"b", "a", "hidden"}) {
		t.Fatal(got)
	}
	if err := s.MoveResource(ctx, "b", nil); err != nil {
		t.Fatal(err)
	}
	if got := order(); !reflect.DeepEqual(got, []string{"a", "hidden", "b"}) {
		t.Fatal(got)
	}
	if _, err := s.Pool.Exec(ctx, "INSERT INTO resources(id,kind,name) VALUES('new','project','New')"); err != nil {
		t.Fatal(err)
	}
	if got := order(); got[len(got)-1] != "new" {
		t.Fatal(got)
	}
	for _, target := range []string{"cross", "preview", "a", "missing"} {
		if err := s.MoveResource(ctx, "app", &target); err == nil {
			t.Fatal("accepted invalid target", target)
		}
	}
	if err := s.MoveResource(ctx, "preview", nil); err == nil {
		t.Fatal("preview moved")
	}
	var wg sync.WaitGroup
	for _, id := range []string{"a", "b"} {
		wg.Go(func() {
			if err := s.MoveResource(ctx, id, nil); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if len(order()) != 4 {
		t.Fatal("concurrent move lost a card")
	}
	if err := s.SaveLogo(ctx, "a", "revision", []byte("png")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, "DELETE FROM resources WHERE id='a'"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.Pool.QueryRow(ctx, "SELECT count(*) FROM resource_logos WHERE resource_id='a'").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
}
