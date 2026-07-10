from app.core.config import Settings


class TestSupabaseServiceKeyEnvVarAliases:
    def test_reads_from_supabase_secret_key(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "from-secret-key")

        settings = Settings(_env_file=None)

        assert settings.supabase_service_key == "from-secret-key"

    def test_reads_from_supabase_service_role_key(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "from-service-role-key")

        settings = Settings(_env_file=None)

        assert settings.supabase_service_key == "from-service-role-key"

    def test_supabase_secret_key_takes_precedence_when_both_are_set(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "new-style")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "old-style")

        settings = Settings(_env_file=None)

        assert settings.supabase_service_key == "new-style"

    def test_defaults_to_empty_string_when_neither_is_set(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

        settings = Settings(_env_file=None)

        assert settings.supabase_service_key == ""


def test_storage_provider_and_bucket_read_from_env(monkeypatch):
    monkeypatch.setenv("STORAGE_PROVIDER", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://xyzcompany.supabase.co")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "documents")

    settings = Settings(_env_file=None)

    assert settings.storage_provider == "supabase"
    assert settings.supabase_url == "https://xyzcompany.supabase.co"
    assert settings.supabase_storage_bucket == "documents"


def test_storage_provider_defaults_to_local():
    settings = Settings(_env_file=None)

    assert settings.storage_provider == "local"
