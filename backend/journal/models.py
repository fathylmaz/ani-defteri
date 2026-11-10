import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.db.models.functions import Lower


class Account(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    email_verified = models.BooleanField(default=False)
    display_name = models.CharField(max_length=60, blank=True)
    bio = models.CharField(max_length=300, blank=True)
    instagram = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=500, blank=True)
    avatar = models.ForeignKey(
        "Media", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    legacy_id = models.CharField(max_length=200, blank=True)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="account_email_ci"),
            models.UniqueConstraint(Lower("username"), name="account_username_ci"),
        ]


class Album(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="albums")
    name = models.CharField(max_length=80)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="owner_album_name")]


class Memory(models.Model):
    is_draft = models.BooleanField(default=False, db_index=True)
    revision = models.PositiveIntegerField(default=0)
    album = models.ForeignKey(Album, null=True, blank=True, on_delete=models.SET_NULL, related_name="entries")
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name="memories"
    )
    title = models.CharField(max_length=120)
    body = models.TextField()
    date = models.DateField()
    location = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=40)
    visibility = models.CharField(
        max_length=10, choices=[("public", "Herkese açık"), ("private", "Yalnızca ben")]
    )
    created = models.DateTimeField(auto_now_add=True, db_index=True)
    legacy_id = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "legacy_id"],
                condition=~models.Q(legacy_id=""),
                name="memory_import_unique",
            )
        ]


class Media(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="media")
    memory = models.ForeignKey(
        Memory, null=True, blank=True, on_delete=models.CASCADE, related_name="images"
    )
    data = models.BinaryField()
    content_type = models.CharField(max_length=30)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class Follow(models.Model):
    follower = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name="following_edges"
    )
    following = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name="follower_edges"
    )
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "following"], name="follow_unique"
            ),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("following")),
                name="no_self_follow",
            ),
        ]


class Saved(models.Model):
    owner = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name="saved_items"
    )
    # Demo IDs remain supported; real memory authorization is checked on every request.
    memory_id = models.CharField(max_length=100)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "memory_id"], name="saved_unique")
        ]


class RateLimit(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    window = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)
